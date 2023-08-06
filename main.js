const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const bcrypt = require('bcrypt');
const jwt = require("jsonwebtoken")
const aws = require('aws-sdk');
const multer = require('multer');
const nodemailer = require('nodemailer');
app.use(bodyParser.json());
app.use(cors());
const pool = require('./db'); 
aws.config.update({
  accessKeyId: 'AKIA4WNIZPNFBNOAUUOK',   
  secretAccessKey: '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', 
  region: 'us-east-2',             
});
const sns = new aws.SNS();
app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body;

 
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    
    const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [
      username,
    ]);
    if (rows.length > 0) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    await pool.execute('INSERT INTO users (username, password) VALUES (?, ?)', [
      username,
      hashedPassword,
    ]);

    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Retrieve the user from the database
    const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [
      username,
    ]);

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Authentication failed' });
    }

    const user = rows[0];

    // Compare the provided password with the hashed password in the database
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Authentication failed' });
    }

    // Create and send a JSON Web Token (JWT) for successful login
    const token = jwt.sign({ userId: user.id }, new Date().getDate().toString(36)+new Date().getTime().toString(36), {
      expiresIn: '5h',
    });

    res.status(200).json({ token, username });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

const lambda = new aws.Lambda();
const upload = multer();
app.post('/api/upload', upload.single('file') , async (req, res) => {
 try {
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

   
    const payload = {
      fileContent: req.file.buffer.toString('base64'),
      fileName: req.file.originalname,
    };
console.log('came', payload)
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

const transporter = nodemailer.createTransport({
  service: 'Gmail', // Replace with your email service (e.g., Gmail, Outlook, etc.)
  auth: {
    user: 'demosai05@gmail.com',
    pass: 'wpjywhecbzpumxvc',
  },
});

const sendVerificationEmail = async (email, confirmationUrl) => {
  const mailOptions = {
    from: 'Gmail',
    to: email,
    subject: 'Confirm Subscription to My Topic',
    text: `Please click the link below to confirm your subscription:\n\n${confirmationUrl}`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.response);
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};
app.post('/api/send/subscriptions', async(req, res) => {
  const emails = req.body;

await createTopic(`smaremal`)
  .then(async (topicArn) => {
    console.log("Topic created:", topicArn);
    await emails.forEach(async (email) => {
     await subscribeEmailToTopic(topicArn, email)
        .then(async (confirmationUrl) => {
          await sendVerificationEmail(email, confirmationUrl);
         return res.send(200).json({
            status: 200,
            data: "mail Request Send successfully",
            message: "mail Request Send successfully"
          })
        })
        .catch((error) => {
          console.error("Error subscribing email:", error);
        });
    });
  })
  .catch((error) => {
    console.error("Error creating topic:", error);
  });
});




const PORT = 3000; 

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
