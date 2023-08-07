const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const aws = require('aws-sdk');
const multer = require('multer');
const nodemailer = require('nodemailer');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const router = express.Router();
const app = express();
const { v4: uuidv4 } = require('uuid');
const randomUUID = uuidv4();
app.use(bodyParser.json());
app.use(cors());
const pool = require('./db'); 
aws.config.update({
  accessKeyId: 'AKIAUPCKTHUGWACQ2HXD',   
  secretAccessKey: '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', 
  region: 'us-east-2',             
});
const AppPath="http://3.135.206.171/fetch"
const sns = new aws.SNS();
const lambda = new aws.Lambda();
const upload = multer();
function file_deletion_exceeds_count(url){
  const s3 = new aws.S3();

const file_url_path = url;
const urlSplit = file_url_path.split('/');
const bucket_name = urlSplit[2];
const objectKey = urlSplit[urlSplit.length -1];


const header_params = {
  Bucket: 'smalempabucket',
  Key: objectKey,
};

s3.getObject(header_params, (err, data) => {
  if (err) {
    if (err.code === 'NoSuchKey') {
      console.log('File does not exist.');
    } else {
      console.error('Error checking file existence:', err);
    }
  } else {
    console.log('File exists. Proceeding with deletion...');
  
    const deleteParams = {
      Bucket: 'smalempabucket',
      Key: objectKey,
    };
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
const subscribedUsers = async (topicArn) => {
  try {
    const { SNSClient, ListSubscriptionsByTopicCommand } = require("@aws-sdk/client-sns");
    const snsClient = new SNSClient({
      region: "us-east-2", 
      credentials: {
        accessKeyId: "AKIAUPCKTHUGWACQ2HXD",
        secretAccessKey: "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",
      },
    });

    const command = new ListSubscriptionsByTopicCommand({ TopicArn: topicArn });
    const response = await snsClient.send(command);
    const subscribers = response.Subscriptions.map((subscription) => subscription.Endpoint);
    return subscribers;
  } catch (error) {
    console.error("Error in getting subscribed users list:", error);
    return [];
  }
};
const updateCount = async (id, url) => {
  const selectSql = 'SELECT emails, id, count FROM fileclickcount WHERE id = ?';
let result = false
  try {
    const [rows] = await pool.query(selectSql, [id]);
    if (rows.length === 0) {
      console.log('For the given Id no data is found.');
      result = false
      return false;
    }

    const row = rows[0];
    const emailCount = row.emails.split(',').length;
    if (emailCount > row.count) {
      const updateSql = 'UPDATE fileclickcount SET count = count + 1 WHERE id = ?';
      await pool.query(updateSql, [id]);
      console.log('The count updated successfully.');
      result = true
      return true;
    } else {
      file_deletion_exceeds_count(url)
      console.log('The count limit has reached, cannot update the count.');
      result = false
      return false;
    }
  } catch (error) {
    console.error('While updated count, error is encountered:', error);
    result = false
    return false;
  }
  return result
};

const InsertionSqlCommands = async (tbl, values) => {
  let sql = "";
  let queryParams = [];
  
  switch (tbl) {
    case "fileuploaddetails":
      sql = 'INSERT INTO fileuploaddetails (emails, filename, fileuploadeddate, fileurl, id) VALUES (?, ?, ?, ?, ?)';
      queryParams = [values.emails, values.filename, values.fileuploadeddate, values.fileurl, values.id];
      break;
    case "fileclickcount":
      sql = 'INSERT INTO fileclickcount (emails, fileurl, count, id) VALUES (?, ?, ?, ?)';
      queryParams = [values.emails, values.fileurl, 0, values.id];
      break;
    default:
      throw new Error(`Invalid tbl: ${tbl}`);
  }

  try {
    const results = await pool.query(sql, queryParams);
    console.log('Successfully data got inserted:', results);
  } catch (err) {
    console.error('Encountered error while inserting data:', err);
  }
};

async function InsertDataToTables(userEmails, fileUrl, randomId, originalname) {
//   let tblData = {
//     'fileclickcount': { emails: userEmails.join(','), fileurl: fileUrl, count: 0, id: randomId },
//     'fileuploaddetails':{ emails: userEmails.join(','), filename: originalname, fileuploadeddate: new Date(), fileurl: fileUrl, id: randomId };

//  }
  const fileClickObj = { emails: userEmails.join(','), fileurl: fileUrl, count: 0, id: randomId };
  const fileuploaddetails = { emails: userEmails.join(','), filename: originalname, fileuploadeddate: new Date(), fileurl: fileUrl, id: randomId };

  try {
    await InsertionSqlCommands('fileclickcount', fileClickObj);
    await InsertionSqlCommands('fileuploaddetails', fileuploaddetails);
  } catch (error) {
    console.error('Error inserting data to tables:', error);
    throw error;
  }
}
app.post('/api/upload', upload.single('file') , async (req, res) => {
 try {
  if (!req.file) {
    return res.status(400).json({ error: 'no file has been provided' });
  }
    const payload = {
      fileContent: req.file.buffer.toString('base64'),
      fileName: req.file.originalname,
    };
    const lambdaFunData = {
      FunctionName: 'smalempa',
      Payload: JSON.stringify(payload),
    };

    const lambdaInfo = await lambda.invoke(lambdaFunData).promise();

   const response = JSON.parse(lambdaInfo.Payload);
  let randomId = new Date().getDate().toString(36)+new Date().getTime().toString(36)
    const topicArn = 'arn:aws:sns:us-east-2:307246611725:smalempatopic';
    const userEmails = await subscribedUsers(topicArn);
   const fileUrl = JSON.parse(response.body).fileUrl; 
   let tableData = {
     'fileclickcount': { emails: userEmails.join(','), fileurl: JSON.parse(response.body).fileUrl, count: 0, id: randomId },
     'fileuploaddetails':{ emails:userEmails.join(','), filename:req.file.originalname, fileuploadeddate:new Date(), fileurl: JSON.parse(response.body).fileUrl,id:randomId}
   }
   Object.keys(tableData).forEach((key) => {
    InsertionSqlCommands(key, tableData[key])
  })
  
    const snsClient = new SNSClient({
      region: "us-east-2", 
      credentials: {
        accessKeyId: "AKIAUPCKTHUGWACQ2HXD",
        secretAccessKey: "7s1lIBsPgvIh+eXPUwD81ADKzehEbNTJcbhFM+lW",
      },
    });
   const fileUrlFinal = fileUrl.split(".com")[1].replace(/^\/+/, '')
    const message = 'Please click on the link provided to download your file:'+ `${AppPath}/id=${randomId}_url${fileUrlFinal}`;
    const snsPublishParams = {
      TopicArn: topicArn,
      Message: message,
    };
    await snsClient.send(new PublishCommand(snsPublishParams));
    console.log('The file link has been sent to the users successfully who are subscribed.');
   
    res.status(200).json({ success: true, message: 'The file has been successfully uploaded to S3' });
  } catch (error) {
    console.error('Upload failed:', error);
    res.status(500).json({ success: false, message: 'The file upload has failed' });
  }
});




const emailSubscribedToTopic = async (topicArn, email) => {
  try {
    const params = {
      Protocol: 'email',
      TopicArn: topicArn,
      Endpoint: email,
    };

    const data = await sns.subscribe(params).promise();
    return data.ConfirmationUrl; 
  } catch (error) {
    console.error('Error has been encountered while subscribing:', error);
    throw error;
  }
};
const OnTopicCreation = async (topicName) => {
  try {
    const params = {
      Name: topicName,
    };

    const data = await sns.createTopic(params).promise();
    return data.TopicArn;
  } catch (error) {
    console.error('Error has been encountered while creating topic:', error);
    throw error;
  }
};

app.post('/api/subscriptions/send', async(req, res) => {
  const emails = req.body;

  try {
    const topicArn = await OnTopicCreation('smalempatopic');
    const subscriptionPromises = emails.map(async (email) => {
      const confirmationUrl = await emailSubscribedToTopic(topicArn, email);
      return confirmationUrl;
    });

    const confirmationUrls = await Promise.all(subscriptionPromises);

    res.status(200).json({
      status: 200,
      data: confirmationUrls,
      message: 'The mail request to subscribe has been successfully sent',
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
