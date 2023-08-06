

const aws = require('aws-sdk');

const lambda = new aws.Lambda();

aws.config.update({
  accessKeyId: 'AKIA4WNIZPNFBNOAUUOK',   
  secretAccessKey: '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', 
  region: 'us-east-2',             
});
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
      FunctionName: 'smaremal',
      Payload: JSON.stringify(payload),
    };

    const data = await lambda.invoke(lambdaParams).promise();

    const response = JSON.parse(data.Payload);
    console.log('Lambda Response:', response);

    res.status(200).json({ success: true, message: 'File uploaded to S3 successfully' });
  } catch (error) {
    console.error('Upload failed:', error);
    res.status(500).json({ success: false, message: 'Upload failed' });
  }
}