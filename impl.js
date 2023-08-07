const aws = require('aws-sdk');
const sns = new aws.SNS();
const pool = require('./db'); 
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const bucket_name = 'smaremal'
const lamdaFunName = 'smaremal'
const topicName = 'smaremal'
let awsAcessObj = {
  accessKeyId: 'AKIA4WNIZPNFJJPFOPN5',   
  secretAccessKey: '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', 
  region: 'us-east-2',             
} 
aws.config.update(awsAcessObj);
const lambda = new aws.Lambda();
function generateUniqueId() {
  const currentDate = new Date();
  const dayOfMonth = currentDate.getDate().toString(36);
  const currentTime = currentDate.getTime().toString(36);

  return dayOfMonth + currentTime;
}
const getSubscribedUsers = async (topicArn) => {
  try {
    const { SNSClient, ListSubscriptionsByTopicCommand } = require("@aws-sdk/client-sns");
   let { accessKeyId,secretAccessKey} = awsAcessObj
    const snsClient = new SNSClient({
      region: "us-east-2",
      credentials: { accessKeyId,secretAccessKey},
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
const subscribeEmailToTopic = async (topicArn, email) => {
  try {
    const data = await sns.subscribe({Protocol: 'email', TopicArn: topicArn,Endpoint: email,}).promise();
    return data.ConfirmationUrl;
  } catch (error) {
    console.error('Error subscribing email:', error);
    throw error;
  }
};
const createTopic = async (topicName) => {
  try {
     const res = await sns.createTopic({Name: topicName}).promise();
    return res.TopicArn;
  } catch (error) {
    console.error('Error creating topic:', error);
    throw error;
  }
};
exports.subscriptions = async (req, res) => {
      try {
        console.log( '_0000===================')
    const topicArn = await createTopic(topicName);
    console.log( '_===================')
    const subscriptionPromises = req.map(async (email) => {
         console.log( '_--===================')
      const confirmationUrl = await subscribeEmailToTopic(topicArn, email);
       console.log( '_=++==================')
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
}

exports.upload = async (req, res) => {
     try {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }
    const payload = {
      fileContent: req.file.buffer.toString('base64'),
      fileName: req.file.originalname,
    };
    const lambdaParams = {
      FunctionName: lamdaFunName,
      Payload: JSON.stringify(payload),
    };

    const data = await lambda.invoke(lambdaParams).promise();

    const response = JSON.parse(data.Payload);
    let randomId = generateUniqueId()
    const topicArn = 'arn:aws:sns:us-east-2:872769223498:smaremal';
    const userEmails = await getSubscribedUsers(topicArn);
     const downloadUrl = JSON.parse(response.body).downloadUrl; 
    insertItemsToTable('file_upload_list', {id:randomId, emails:userEmails.join(','), file_name:req.file.originalname, uploaded_date:new Date(), file_url: JSON.parse(response.body).downloadUrl})
    insertItemsToTable('file_clicks', {id:randomId, emails:userEmails.join(','),  file_url: JSON.parse(response.body).downloadUrl, clicks: 0})
    let  { accessKeyId,secretAccessKey} = awsAcessObj
    const snsClient = new SNSClient({
      region: "us-east-2", 
      credentials: { accessKeyId,secretAccessKey}
    });
    const message = 'Your file is ready to download:'+ `http://18.117.254.6/download/token=${randomId}_path_${downloadUrl.split(".com")[1].replace(/^\/+/, '')}`;
    const snsPublishParams = {
      TopicArn: topicArn,
      Message: message,
    };
    await snsClient.send(new PublishCommand(snsPublishParams));
    console.log('File link sent to the subscribed users successfully.');
    res.status(200).json({ success: true, message: 'File uploaded to S3 successfully' });
  } catch (error) {
    console.error('Upload failed:', error);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
}