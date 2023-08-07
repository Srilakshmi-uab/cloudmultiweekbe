const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const { v4: uuidv4 } = require('uuid');
const randomUUID = uuidv4();
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const aws = require('aws-sdk');
const multer = require('multer');
const nodemailer = require('nodemailer');
app.use(bodyParser.json());
app.use(cors());
const pool = require('./db'); 
aws.config.update({
  accessKeyId: 'AKIA4WNIZPNFJJPFOPN5',   
  secretAccessKey: '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', 
  region: 'us-east-2',             
});
const sns = new aws.SNS();
const lambda = new aws.Lambda();
const upload = multer();
function delete_file_if_file_exceeds(url){
  const s3 = new aws.S3();

const filePathUrl = url;

// Extract the bucket name and object key from the file path URL
const urlParts = filePathUrl.split('/');
const bucketName = urlParts[2];
const objectKey = urlParts[urlParts.length -1];
console.log('vv', bucketName, objectKey)
// Define the parameters for the headObject operation to check file existence
const headParams = {
  Bucket: 'smaremal',
  Key: objectKey,
};

s3.getObject(headParams, (err, data) => {
  if (err) {
    if (err.code === 'NoSuchKey') {
      console.log('File does not exist.');
    } else {
      console.error('Error checking file existence:', err);
    }
  } else {
    console.log('File exists. Proceeding with deletion...');
    
    // Define the parameters for the delete operation
    const deleteParams = {
      Bucket: 'smaremal',
      Key: objectKey,
    };

    // Call the deleteObject method to delete the file
    s3.deleteObject(deleteParams, (deleteErr, deleteData) => {
      if (deleteErr) {
        console.error('Error deleting file:', deleteErr);
      } else {
        console.log('File deleted successfully:', deleteData);
      }
    });
  }
});
}
const getSubscribedUsers = async (topicArn) => {
  try {
    const { SNSClient, ListSubscriptionsByTopicCommand } = require("@aws-sdk/client-sns");
    const snsClient = new SNSClient({
      region: "us-east-2", // Replace with your desired AWS region
      credentials: {
        accessKeyId: "AKIA4WNIZPNFJJPFOPN5",
        secretAccessKey: "Z3Xu11utJzlvDiKA9g1U3t3qOv/TIaoZF/vEW3oV",
      },
    });

    const command = new ListSubscriptionsByTopicCommand({ TopicArn: topicArn });
    const response = await snsClient.send(command);
    const subscribers = response.Subscriptions.map((subscription) => subscription.Endpoint);
    return subscribers;
  } catch (error) {
    console.error("Error getting subscribers:", error);
    return [];
  }
};
const updateClick = async (id, url) => {
  const selectSql = 'SELECT emails, id, clicks FROM file_clicks WHERE id = ?';

  try {
    const [rows] = await pool.query(selectSql, [id]);
    if (rows.length === 0) {
      console.log('No data found for the given ID.');
      return false;
    }

    const row = rows[0];
    const emailCount = row.emails.split(',').length;
    if (emailCount > row.clicks) {
      const updateSql = 'UPDATE file_clicks SET clicks = clicks + 1 WHERE id = ?';
      await pool.query(updateSql, [id]);
      console.log('Click updated successfully.');
      return true;
    } else {
      delete_file_if_file_exceeds(url)
      console.log('Cannot update click. Click limit reached.');
      return false;
    }
  } catch (error) {
    console.error('Error while updating click:', error);
    return false;
  }
};

const insertItemsToTable=async (tablename,values)=>{
  let sql="";
  if(tablename=="file_upload_list"){
      sql = 'INSERT INTO file_upload_list (id, emails, file_name,uploaded_date,file_url) VALUES (?, ?, ?,?,?)';
      pool.query(sql, [values.id, values.emails, values.file_name,values.uploaded_date,values.file_url], (err, results) => {
        if (err) {
          return console.error('Error inserting data:', err);
          } else {
            return console.log('Data inserted successfully:', results);
          }
       }) 
    } 
      else if(tablename=="file_clicks"){
      sql = 'INSERT INTO file_clicks (emails, file_url, clicks, id) VALUES (?, ?, ?,?)';
      pool.query(sql, [values.emails, values.file_url,0, values.id], (err, results) => {
        if (err) {
          return console.error('Error inserting data:', err);
          } else {
            return console.log('Data inserted successfully:', results);
          }
       }) 
  }
  
}

app.post('/api/upload', upload.single('file') , async (req, res) => {
 try {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }
    const payload = {
      fileContent: req.file.buffer.toString('base64'),
      fileName: req.file.originalname,
    };
    const lambdaParams = {
      FunctionName: 'smaremal',
      Payload: JSON.stringify(payload),
    };

    const data = await lambda.invoke(lambdaParams).promise();

    const response = JSON.parse(data.Payload);
  let randomId = new Date().getDate().toString(36)+new Date().getTime().toString(36)
    const topicArn = 'arn:aws:sns:us-east-2:872769223498:smaremal';
    const userEmails = await getSubscribedUsers(topicArn);
     const downloadUrl = JSON.parse(response.body).downloadUrl; 
    console.log('==========')
    insertItemsToTable('file_upload_list', {id:randomId, emails:userEmails.join(','), file_name:req.file.originalname, uploaded_date:new Date(), file_url: JSON.parse(response.body).downloadUrl})
    insertItemsToTable('file_clicks', {id:randomId, emails:userEmails.join(','),  file_url: JSON.parse(response.body).downloadUrl, clicks: 0})
    const snsClient = new SNSClient({
      region: "us-east-2", 
      credentials: {
        accessKeyId: "AKIA4WNIZPNFJJPFOPN5",
        secretAccessKey: "Z3Xu11utJzlvDiKA9g1U3t3qOv/TIaoZF/vEW3oV",
      },
    });

    const message = 'Your file is ready to download:'+ `http://localhost:4200/download/token=${randomId}_path_${downloadUrl.split(".com")[1].replace(/^\/+/, '')}`;
    const snsPublishParams = {
      TopicArn: topicArn,
      Message: message,
    };
    console.log(downloadUrl.split(".com"))
    await snsClient.send(new PublishCommand(snsPublishParams));
    console.log('File link sent to the subscribed users successfully.');
   
    res.status(200).json({ success: true, message: 'File uploaded to S3 successfully' });
  } catch (error) {
    console.error('Upload failed:', error);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
});



const subscribeEmailToTopic = async (topicArn, email) => {
  try {
    const params = {
      Protocol: 'email',
      TopicArn: topicArn,
      Endpoint: email,
    };

    const data = await sns.subscribe(params).promise();
    return data.ConfirmationUrl; // Get the Confirmation URL from the response
  } catch (error) {
    console.error('Error subscribing email:', error);
    throw error;
  }
};
const createTopic = async (topicName) => {
  try {
    const params = {
      Name: topicName,
    };

    const data = await sns.createTopic(params).promise();
    console.log('hg', data)
    return data.TopicArn;
  } catch (error) {
    console.error('Error creating topic:', error);
    throw error;
  }
};

app.post('/api/send/subscriptions', async(req, res) => {
  const emails = req.body;

  try {
    const topicArn = await createTopic('smaremal');
    console.log('Topic created:', topicArn);

    const subscriptionPromises = emails.map(async (email) => {
      const confirmationUrl = await subscribeEmailToTopic(topicArn, email);
      // await sendVerificationEmail(email, confirmationUrl); // Uncomment this if needed
      return confirmationUrl;
    });

    const confirmationUrls = await Promise.all(subscriptionPromises);

    res.status(200).json({
      status: 200,
      data: confirmationUrls,
      message: 'Mail Request Sent Successfully',
    });
  } catch (error) {
    console.error('Error in subscription process:', error);
    res.status(500).json({
      status: 500,
      error: 'Error in subscription process',
    });
  }
});


app.post('/api/countCliks', async(req, res) => {
  try{
 if(await updateClick(req.body.userId, req.body.url)){
    res.status(200).json({status:200, data: true})
  } else{
    res.status(200).json({status:200, data: false})
  }
  }catch(err){
    res.status(500).json({status:500, data: err})
  }
 
  
})

const PORT = 3000; 

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
