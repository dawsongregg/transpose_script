// server.js
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// GHL webhook for workflow #2 (creates the "other person")
const GHL_WEBHOOK_URL =
  process.env.GHL_WEBHOOK_URL ||
  "https://services.leadconnectorhq.com/hooks/9RO36OEQxzdIqkmWAwE1/webhook-trigger/c748beb7-f78b-4d00-9885-20bc41a62640";

/* ------------------------- helpers ------------------------- */

const first = (...vals) =>
  vals.find(v => v !== undefined && v !== null && String(v).trim() !== "") ?? "";

// pull safely from many possible locations / spellings
function normalize(src) {
  const cd = src.customData || src.customFields || {}; // accept either key

  // who is the sender?
  const actor = (
    first(
      cd.student_parent_or_student,
      cd.student_parent_or_a_student,           // typo safety
      src.student_parent_or_student,
      src["Are you a parent or a student?"],
      (cd.userType || src.contactType)          // "Parent"/"Student" if you send it this way
    ) || "Unknown"
  ).toString().trim();

  // "basic" (the sender's) info — accept snake or camel or contact.*
  const sender = {
    firstName: first(src.firstName, src.first_name, src["first_name"], cd.firstName, cd.first_name, src?.contact?.first_name),
    lastName:  first(src.lastName,  src.last_name,  src["last_name"],  cd.lastName,  cd.last_name,  src?.contact?.last_name),
    email:     first(src.email,     cd.email,       src?.contact?.email),
    phone:     first(src.phone,     cd.phone,       src?.contact?.phone)
  };

  // STUDENT candidates (prefer student1*, then legacy student_* keys)
  const student = {
    firstName: first(cd.student1FirstName, cd.student_first_name, cd.student_firstname, src.student_first_name),
    lastName:  first(cd.student1LastName,  cd.student_last_name,  cd.student_lastname,  src.student_last_name),
    email:     first(cd.student1Email,     cd.student_email,      src.student_email),
    phone:     first(cd.student1Phone,     cd.student_phone,      src.student_phone)
  };

  // PARENT (collaborator1) candidates (prefer collaborator1*, then legacy parent_* keys, then short keys)
  const parent = {
    firstName: first(cd.collaborator1FirstName, cd.parent_first_name, cd.collaborator1F, src.parent_first_name),
    lastName:  first(cd.collaborator1LastName,  cd.parent_last_name,  cd.collaborator1L, src.parent_last_name),
    email:     first(cd.collaborator1Email,     cd.parent_email,      cd.collaborator1E, src.parent_email),
    phone:     first(cd.collaborator1Phone,     cd.parent_phone,      cd.collaborator1P, src.parent_phone)
  };

  // tags can arrive in a few places
  const tags = first(src.tags, cd.tags, src.tagList);

  return { actor, sender, student, parent, tags, raw: src };
}

function buildPayloadForStudent(counterparts, meta) {
  // Create STUDENT contact; stash PARENT in customData
  const { student, parent, tags } = counterparts;
  return {
    first_name: student.firstName,
    last_name:  student.lastName,
    phone:      student.phone,
    email:      student.email,
    tags:       tags,
    contact_type: "lead",
    customData: {
      parent_first_name: parent.firstName,
      parent_last_name:  parent.lastName,
      parent_phone:      parent.phone,
      parent_email:      parent.email,
      student_parent_or_student: "Student"
    },
    meta: {
      source: meta?.source || "transpose",
      received_at: new Date().toISOString()
    }
  };
}

function buildPayloadForParent(counterparts, meta) {
  // Create PARENT contact; stash STUDENT in customData
  const { parent, student, tags } = counterparts;
  return {
    first_name: parent.firstName,
    last_name:  parent.lastName,
    phone:      parent.phone,
    email:      parent.email,
    tags:       tags,
    contact_type: "lead",
    customData: {
      student_first_name: student.firstName,
      student_last_name:  student.lastName,
      student_phone:      student.phone,
      student_email:      student.email,
      student_parent_or_student: "Parent"
    },
    meta: {
      source: meta?.source || "transpose",
      received_at: new Date().toISOString()
    }
  };
}

/* ------------------------- route ------------------------- */

app.post("/webhook", async (req, res) => {
  try {
    const norm = normalize(req.body);
    console.log("↘︎ Incoming (normalized):", JSON.stringify(norm, null, 2));

    let outbound;
    if (/^parent$/i.test(norm.actor)) {
      outbound = buildPayloadForStudent(norm, { source: "parent->student" });
    } else if (/^student$/i.test(norm.actor)) {
      outbound = buildPayloadForParent(norm, { source: "student->parent" });
    } else {
      console.warn("⚠️ Unknown actor; echoing payload to help debugging.");
      outbound = { ...req.body, meta: { note: "unknown-actor", received_at: new Date().toISOString() } };
    }

    // minimal sanity check so we don’t create empty contacts
    const hasCore =
      first(outbound.first_name) && (first(outbound.email) || first(outbound.phone));
    if (!hasCore) {
      console.warn("⚠️ Missing core fields for new contact; skipping send.", outbound);
      return res.status(202).json({ skipped: true, reason: "missing core fields", preview: outbound });
    }

    console.log("↗︎ Sending to GHL:", JSON.stringify(outbound, null, 2));
    await axios.post(GHL_WEBHOOK_URL, outbound, { headers: { "Content-Type": "application/json" } });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("❌ transpose error:", err?.response?.data || err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ------------------------- boot ------------------------- */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook server on :${PORT}`);
  console.log(`POST ${process.env.RENDER_EXTERNAL_URL || "http://localhost:" + PORT}/webhook`);
});
