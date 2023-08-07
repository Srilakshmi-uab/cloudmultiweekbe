const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const aws = require('aws-sdk');
const multer = require('multer');
const nodemailer = require('nodemailer');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const { v4: uuidv4 } = require('uuid');
const randomUUID = uuidv4();
app.use(bodyParser.json());
app.use(cors());
const pool = require('./db'); 
const accessKey = {
  accessKeyId: 'AKIAUPCKTHUGWACQ2HXD',   
  secretAccessKey: '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', 
  region: 'us-east-2',        
}
aws.config.update(accessKey);
const sns = new aws.SNS();
const lambda = new aws.Lambda();
const upload = multer();
function file_delete_if_clicks_count_exceed(url){
  const s3 = new aws.S3();

const filePathUrl = url;

// Extract the bucket name and object key from the file path URL
const urlParts = filePathUrl.split('/');
const bucketName = urlParts[2];
const objectKey = urlParts[urlParts.length -1];
// Define the parameters for the headObject operation to check file existence
const headParams = {
  Bucket: 'smalempabucket',
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
      Bucket: 'smalempabucket',
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
         accessKeyId: 'AKIAUPCKTHUGWACQ2HXD',   
  secretAccessKey: '7s1lIBsPgvIh+eXPUwD81ADKzehEbNTJcbhFM+lW', 
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
const updateCount = async (id, url) => {
  const selectSql = 'SELECT emails, id, count FROM fileclickcount WHERE id = ?';
  console.log(id, 'count')
  try {
    const [rows] = await pool.query(selectSql, [id]);
    console.log(rows, 'rowsrowsrows')
    if (rows.length === 0) {
      console.log('No data found for the given ID.');
      return false;
    }

    const row = rows[0];
    const emailCount = row.emails.split(',').length;
    if (emailCount > row.count) {
      const updateSql = 'UPDATE fileclickcount SET count = count + 1 WHERE id = ?';
      await pool.query(updateSql, [id]);
      console.log('Click updated successfully.');
      return true;
    } else {
      file_delete_if_clicks_count_exceed(url)
      console.log('Cannot update click. Click limit reached.');
      return false;
    }
    return 
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
const insertingDataToTables=async (tablename,values)=>{
  let sql="";
  if (tablename == "fileuploaddetails") {
      sql = 'INSERT INTO fileuploaddetails (emails, filename,fileuploadeddate,fileurl,id) VALUES (?, ?, ?,?,?)';
    pool.query(sql, [values.emails, values.filename, values.fileuploadeddate, values.fileurl, values.id], (err, results) => {
      if (err) {
           console.log(145, 'count')
          return console.error('Encountered error while inserting data:', err);
      } else {
         console.log(148, 'count') 
            return console.log('Successfully data got inserted:', results);
          }
       }) 
    } 
      else if(tablename=="fileclickcount"){
      sql = 'INSERT INTO fileclickcount (emails, fileurl, count, id) VALUES (?, ?, ?,?)';
      pool.query(sql, [values.emails, values.fileurl,0, values.id], (err, results) => {
        if (err) {
          return console.error('Encountered error while inserting data:', err);
          } else {
            return console.log('Successfully data got inserted:', results);
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
      FunctionName: 'smalempa',
      Payload: JSON.stringify(payload),
    };

    const data = await lambda.invoke(lambdaParams).promise();

    const response = JSON.parse(data.Payload);
  let randomId = new Date().getDate().toString(36)+new Date().getTime().toString(36)
    const topicArn = 'arn:aws:sns:us-east-2:307246611725:smalempatopic';
    const userEmails = await getSubscribedUsers(topicArn);
     const fileUrl = JSON.parse(response.body).fileUrl; 
    console.log('==========')
     insertingDataToTables('fileuploaddetails', { emails:userEmails.join(','), filename:req.file.originalname, fileuploadeddate:new Date(), fileurl: JSON.parse(response.body).fileUrl,id:randomId})
    insertingDataToTables('fileclickcount', {emails:userEmails.join(','),  fileurl: JSON.parse(response.body).fileUrl, count: 0,id:randomId})
    const snsClient = new SNSClient({
      region: "us-east-2", 
      credentials: {
         accessKeyId: 'AKIAUPCKTHUGWACQ2HXD',   
  secretAccessKey: '7s1lIBsPgvIh+eXPUwD81ADKzehEbNTJcbhFM+lW', 
      },
    });

    const message = 'Please click on the link provided to download your file:'+ `http://localhost:4200/fetch/id=${randomId}_url${fileUrl.split(".com")[1].replace(/^\/+/, '')}`;
    const snsPublishParams = {
      TopicArn: topicArn,
      Message: message,
    };
    console.log(fileUrl.split(".com"))
    await snsClient.send(new PublishCommand(snsPublishParams));
    console.log('A file link has been sent to the subscribed users successfully.');
   
    return res.status(200).json({ success: true, message: 'File has been uploaded to S3 successfully' });
  } catch (error) {
    console.error('Upload failed:', error);
    return res.status(500).json({ success: false, message: 'Upload failed' });
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
    console.error('Error has been encountered while subscribing email:', error);
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
    console.error('Error has been encountered while creating topic:', error);
    throw error;
  }
};

app.post('/api/subscriptions/send', async(req, res) => {
  const emails = req.body;

  try {
    const topicArn = await createTopic('smalempatopic');
    console.log('Created topic:', topicArn);

    const subscriptionPromises = emails.map(async (email) => {
      const confirmationUrl = await subscribeEmailToTopic(topicArn, email);
      // await sendVerificationEmail(email, confirmationUrl); // Uncomment this if needed
      return confirmationUrl;
    });

    const confirmationUrls = await Promise.all(subscriptionPromises);

    res.status(200).json({
      status: 200,
      data: confirmationUrls,
      message: 'The request mail to subscribe has been sent',
    });
  } catch (error) {
    console.error('Error has been encountered in subscription process:', error);
    res.status(500).json({
      status: 500,
      error: 'Error has been encountered in subscription process',
    });
  }
});


app.post('/api/count', async(req, res) => {
  try{
 if(await updateCount(req.body.userId, req.body.url)){
    res.status(200).json({status:200, data: true})
  } else{
    res.status(200).json({status:200, data: false})
  }
  }catch(err){
    res.status(500).json({status:500, data: err})
  }
 
  
})

const PORT = 4500; 

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
