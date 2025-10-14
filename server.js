const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// Your GHL webhook URL for the 2nd workflow
const GHL_WEBHOOK_URL =
  process.env.GHL_WEBHOOK_URL ||
  "https://services.leadconnectorhq.com/hooks/9RO36OEQxzdIqkmWAwE1/webhook-trigger/a566467d-02f2-4143-8a56-44864a060d30";

app.post("/webhook", async (req, res) => {
  try {
    const incomingData = req.body;
    console.log("Received webhook data:", JSON.stringify(incomingData, null, 2));

    // Extract values safely
    const cd = incomingData.customData || {};

    const parentOrStudent =
      cd.student_parent_or_student ||
      incomingData["student_parent_or_student"] ||
      incomingData["Are you a parent or a student? "] ||
      "Unknown";

    let outboundPayload = {};

    // If PARENT filled the form → make STUDENT the new contact
    if (parentOrStudent === "Parent") {
      outboundPayload = {
        first_name: cd.student_first_name || "",
        last_name: cd.student_last_name || "",
        phone: cd.student_phone || "",
        email: cd.student_email || "",
        tags: incomingData.tags || "",
        contact_type: "lead",
        customData: {
          parent_first_name: incomingData.first_name || "",
          parent_last_name: incomingData.last_name || "",
          parent_phone: incomingData.phone || "",
          parent_email: incomingData.email || "",
          student_parent_or_student: "Student"
        },
        location: incomingData.location || {},
        workflow: incomingData.workflow || {},
        date_created: new Date().toISOString()
      };
    }

    // If STUDENT filled the form → make PARENT the new contact
    else if (parentOrStudent === "Student") {
      outboundPayload = {
        first_name: cd.parent_first_name || "",
        last_name: cd.parent_last_name || "",
        phone: cd.parent_phone || "",
        email: cd.parent_email || "",
        tags: incomingData.tags || "",
        contact_type: "lead",
        customData: {
          student_first_name: incomingData.first_name || "",
          student_last_name: incomingData.last_name || "",
          student_phone: incomingData.phone || "",
          student_email: incomingData.email || "",
          student_parent_or_student: "Parent"
        },
        location: incomingData.location || {},
        workflow: incomingData.workflow || {},
        date_created: new Date().toISOString()
      };
    }

    // Fallback if unrecognized
    else {
      console.warn(
        "⚠️ Unknown student_parent_or_student value, skipping transpose."
      );
      outboundPayload = incomingData;
    }

    console.log(
      "Sending outbound payload:",
      JSON.stringify(outboundPayload, null, 2)
    );

    // Send payload to GHL webhook
    const response = await axios.post(GHL_WEBHOOK_URL, outboundPayload, {
      headers: { "Content-Type": "application/json" }
    });

    console.log("✅ Webhook sent successfully:", response.status);
    res
      .status(200)
      .json({ success: true, message: "Webhook processed successfully" });
  } catch (error) {
    console.error("❌ Error processing webhook:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook server running on port ${PORT}`);
  console.log(`📬 Endpoint: http://localhost:${PORT}/webhook`);
});