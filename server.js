const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// Replace with your actual GHL webhook URL
const GHL_WEBHOOK_URL = process.env.GHL_WEBHOOK_URL || 'https://your-ghl-instance.com/webhook-endpoint';

app.post('/webhook', async (req, res) => {
  try {
    const incomingData = req.body;
    
    console.log('Received webhook data:', JSON.stringify(incomingData, null, 2));
    
    // Extract basic contact information
    const firstName = incomingData.first_name;
    const lastName = incomingData.last_name;
    const phone = incomingData.phone;
    const email = incomingData.email;
    const tags = incomingData.tags;
    const parentOrStudent = incomingData["Are you a parent or a student? "];
    
    // Extract parent information from custom fields
    const parentFirstName = incomingData.customData?.parent_first_name || incomingData["Parent First Name"];
    const parentLastName = incomingData.customData?.parent_last_name || incomingData["Parent Last Name"];
    const parentEmail = incomingData.customData?.parent_email || incomingData["Parent Email Address "];
    const parentPhone = incomingData.customData?.parent_phone || incomingData["Parent Phone Number"];
    
    // Prepare the outbound webhook payload
    const outboundPayload = {
      // Parent info as basic contact info
      first_name: parentFirstName,
      last_name: parentLastName,
      phone: parentPhone,
      email: parentEmail,
      tags: tags,
      contact_type: "lead",
      
      // Original contact info as student info in custom fields
      customData: {
        student_first_name: firstName,
        student_last_name: lastName,
        student_phone: phone,
        student_email: email,
        student_parent_or_student: parentOrStudent
      },
      
      // Include other relevant data
      location: incomingData.location,
      workflow: incomingData.workflow,
      date_created: new Date().toISOString()
    };
    
    console.log('Sending outbound payload:', JSON.stringify(outboundPayload, null, 2));
    
    // Send the webhook to GHL
    const response = await axios.post(GHL_WEBHOOK_URL, outboundPayload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Webhook sent successfully:', response.status);
    res.status(200).json({ success: true, message: 'Webhook processed successfully' });
    
  } catch (error) {
    console.error('Error processing webhook:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook server running on port ${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook`);
});
