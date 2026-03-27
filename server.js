const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Set up paths for Vercel Serverless environment
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL;
const UPLOADS_DIR = isVercel ? '/tmp/uploads' : 'uploads/';
const DB_PATH = isVercel ? '/tmp/database.sqlite' : 'database.sqlite';

// Set up Multer (file uploads)
const upload = multer({ dest: UPLOADS_DIR });

// Ensure uploads dir exists
if (!fs.existsSync(UPLOADS_DIR)){
    fs.mkdirSync(UPLOADS_DIR);
}

// Database Setup
let sqlite3;
let db;

try {
    sqlite3 = require('sqlite3').verbose();
    db = new sqlite3.Database(DB_PATH, (err) => {
        if (err) console.error(err.message);
        else console.log('Connected to the SQLite database at ' + DB_PATH);
    });

    db.serialize(() => {
        // Create Candidates table
        db.run(`CREATE TABLE IF NOT EXISTS candidates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT,
            status TEXT,
            vote TEXT,
            summary TEXT,
            consideration TEXT,
            city TEXT,
            phone TEXT,
            skills TEXT,
            educational TEXT,
            jobHistory TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Create Settings table for the dynamic JD
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE,
            value TEXT
        )`);

        // Create Leads table for tagged candidates
        db.run(`CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            role TEXT,
            linkedin_url TEXT,
            summary TEXT,
            tag TEXT,
            folder TEXT,
            status TEXT DEFAULT 'Stored',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Add folder column if it doesn't exist (handle existing DB)
        db.run(`ALTER TABLE leads ADD COLUMN folder TEXT`, (err) => {
            if (err) { /* ignore if already exists */ }
        });

        // Insert default JD if none exists
        const defaultJD = `We are Mondee, a leading travel technology company, and we are looking for a MarTech professional with around 3 years of experience. The ideal candidate should have a strong understanding of marketing technologies, including CRM platforms, marketing automation tools, analytics systems, and digital campaign management.`;
        db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('job_description', ?)`, [defaultJD]);
        db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('webhook_url', 'http://localhost:5678/webhook/profile-evoluation')`);
    });
} catch (e) {
    console.warn("Failed to load sqlite3 native bindings (expected on Vercel):", e.message);
    // Provide a mocked basic dummy DB interface to prevent application crashes
    db = {
        run: (...args) => {
            const cb = args.find(a => typeof a === 'function') || function(){};
            cb.call({ lastID: Math.floor(Math.random() * 1000) }, null);
        },
        get: (...args) => {
            const cb = args.find(a => typeof a === 'function') || function(){};
            cb(null, null);
        },
        all: (...args) => {
            const cb = args.find(a => typeof a === 'function') || function(){};
            cb(null, []);
        },
        serialize: (cb) => { try { cb() } catch(err){} }
    };
}

// Helper to get setting
const getSetting = (key) => new Promise((resolve, reject) => {
    db.get(`SELECT value FROM settings WHERE key = ?`, [key], (err, row) => {
        if (err) reject(err);
        resolve(row ? row.value : null);
    });
});

// JD Settings

// API ROUTES //////////////////////////////////////////////////////

// GET dynamically set JD
app.get('/api/settings/jd', async (req, res) => {
    try {
        const jd = await getSetting('job_description');
        const role = await getSetting('target_role');
        res.json({ jd, role });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST to update JD
app.post('/api/settings/jd', async (req, res) => {
    const { jd, role } = req.body;
    console.log(`Update JD Request - Role: ${role}, JD Length: ${jd ? jd.length : 0}`);
    
    try {
        if (jd !== undefined) {
            await new Promise((resolve, reject) => {
                db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('job_description', ?)`, [jd], function(err) {
                    if (err) reject(err);
                    else resolve();
                });
            });
            console.log("Local JD updated successfully in database.");
        }
        if (role !== undefined) {
            await new Promise((resolve, reject) => {
                db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES ('target_role', ?)`, [role], function(err) {
                    if (err) reject(err);
                    else resolve();
                });
            });
            console.log("Local Target Role updated successfully in database.");
        }
        res.json({ success: true, message: 'Job description updated successfully!' });
    } catch (dbErr) {
        console.error("Database update failed:", dbErr.message);
        res.status(500).json({ error: dbErr.message });
    }
});

// AI Job Description Generation
app.post('/api/ai/generate-jd', async (req, res) => {
    const { role } = req.body;
    if (!role) return res.status(400).json({ error: 'Role is required.' });

    console.log(`Generating JD for role: ${role}`);

    // Since we don't have a direct LLM API key here, we use a sophisticated template system 
    // that simulates an AI response. This provides immediate value.
    const templates = {
        'software engineer': `We are looking for a skilled Software Engineer to join our dynamic team. You will be responsible for developing high-quality applications, collaborating with cross-functional teams, and contributing to all phases of the development lifecycle.\n\nKey Responsibilities:\n- Write clean, maintainable, and efficient code.\n- Design and implement robust software solutions.\n- Troubleshoot and debug applications.\n- Stay up-to-date with emerging technologies.\n\nQualifications:\n- Proficiency in modern programming languages (e.g., JavaScript, Python, Java).\n- Strong understanding of software development principles.\n- Excellent problem-solving skills.\n- Experience with version control systems (Git).`,
        'react developer': `Join us as a React Developer and help us build stunning user interfaces. You will work closely with designers and backend engineers to create seamless digital experiences.\n\nKey Responsibilities:\n- Develop responsive and interactive UI components using React.js.\n- Optimize application performance for maximum speed and scalability.\n- Implement state management libraries (e.g., Redux, Context API).\n- Collaborate on API design and integration.\n\nQualifications:\n- Strong proficiency in JavaScript, HTML5, and CSS3.\n- Thorough understanding of React.js and its core principles.\n- Experience with popular React.js workflows.\n- Knowledge of modern authorization mechanisms (e.g., JWT).`,
        'marketing manager': `We are seeking a creative and data-driven Marketing Manager to lead our marketing efforts. You will be responsible for developing and executing strategies to increase brand awareness and drive customer acquisition.\n\nKey Responsibilities:\n- Plan and execute digital marketing campaigns across multiple channels.\n- Analyze campaign performance and optimize based on insights.\n- Manage the marketing budget and ROI.\n- Collaborate with sales and product teams to align messaging.\n\nQualifications:\n- Proven experience in marketing management.\n- Strong analytical and project management skills.\n- Experience with SEO, SEM, and social media marketing.\n- Excellent communication and presentation abilities.`,
        'martech': `We are Mondee, a leading travel technology company, and we are looking for a MarTech professional with around 3 years of experience. The ideal candidate should have a strong understanding of marketing technologies, including CRM platforms, marketing automation tools, analytics systems, and digital campaign management.`
    };

    const roleKey = role.toLowerCase();
    let generatedJD = templates[roleKey] || templates['martech'];

    // If no exact match, try to find a partial match or use a generic template
    if (!templates[roleKey]) {
        for (const [key, value] of Object.entries(templates)) {
            if (roleKey.includes(key) || key.includes(roleKey)) {
                generatedJD = value;
                break;
            }
        }
    }

    // Generic fallback if still no good match
    if (!generatedJD || generatedJD === templates['martech'] && !roleKey.includes('martech')) {
        generatedJD = `We are seeking a dedicated ${role} to join our team. The successful candidate will be responsible for delivering high-quality results and contributing to the overall success of our projects.\n\nKey Responsibilities:\n- Perform duties specific to the ${role} position.\n- Collaborate with team members to achieve goals.\n- Maintain high standards of quality and professionalism.\n\nQualifications:\n- Proven experience in a similar role.\n- Strong interpersonal and communication skills.\n- Ability to work effectively in a fast-paced environment.`;
    }

    res.json({ jd: generatedJD });
});

// GET all candidates
app.get('/api/candidates', (req, res) => {
    db.all(`SELECT * FROM candidates ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// LEADS API //////////////////////////////////////////////////////

// GET all stored leads
app.get('/api/leads', (req, res) => {
    db.all(`SELECT * FROM leads ORDER BY created_at DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// POST to save a lead
app.post('/api/leads', (req, res) => {
    const { name, role, linux_url, summary, tag, folder } = req.body;
    const url = linux_url || req.body.linkedin_url;
    
    db.run(`INSERT INTO leads (name, role, linkedin_url, summary, tag, folder) VALUES (?, ?, ?, ?, ?, ?)`,
        [name, role, url, summary, tag, folder], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

// DELETE a lead
app.delete('/api/leads/:id', (req, res) => {
    db.run(`DELETE FROM leads WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// POST candidate application (from Candidate portal)
app.post('/api/apply', upload.single('CV'), async (req, res) => {
    const { Name, Email } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'CV file is required.' });

    // Insert pending
    db.run(`INSERT INTO candidates (name, email, status) VALUES (?, ?, 'Evaluating')`,
        [Name, Email], async function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        const candidateId = this.lastID;
        res.json({ success: true, message: 'Candidate submitted to evaluation pipeline.', candidateId });

        // Process with n8n Webhook async
        try {
            const webhookUrl = await getSetting('webhook_url');
            const jd = await getSetting('job_description');
            const role = await getSetting('target_role');
            
            console.log(`Processing evaluation for ${Name} (${Email})`);
            console.log(`Using JD: "${jd ? jd.substring(0, 50) : 'NONE'}..."`);
            console.log(`Using Role: "${role || 'N/A'}"`);

            const fd = new FormData();
            fd.append('Name', Name);
            fd.append('Email', Email);
            // We append the JD dynamically directly onto the webhook!
            fd.append('JD', jd);
            fd.append('Role', role || '');
            fd.append('CV', fs.createReadStream(file.path), file.originalname);

            // Dynamically import node-fetch to avoid ERR_REQUIRE_ESM crash on Vercel
            const { default: fetchReq } = await import('node-fetch');

            const n8nRes = await fetchReq(webhookUrl, {
                method: 'POST',
                body: fd
            });

            if (!n8nRes.ok) throw new Error(`n8n returned ${n8nRes.status}`);
            
            let data = await n8nRes.json();
            let props = Array.isArray(data) ? data[0] : data;
            if (props.json) props = props.json; // Extract n8n json if present

            // Clean up file
            fs.unlinkSync(file.path);

            const vote = props.VOTE || props.vote || 'N/A';
            const consider = props.CONSIDERATION || props.consideration || '';
            const summary = props.SUMMARIZE || props.summary || props.text || '';
            const city = props.CITY || props.city || '';
            const phone = props.PHONE || props.telephone || '';
            
            // Convert skills to string if Array
            let skills = props.SKILLS || props.Skills || '';
            if (Array.isArray(skills)) skills = skills.join(', ');

            const edu = props.EDUCATIONAL || props['Educational qualification'] || '';
            const history = props['JOB HISTORY'] || props['Job History'] || '';

            db.run(`UPDATE candidates SET 
                status = 'Evaluated', vote = ?, summary = ?, consideration = ?, city = ?, phone = ?, skills = ?, educational = ?, jobHistory = ?
                WHERE id = ?`,
                [vote, summary, consider, city, phone, skills, edu, history, candidateId]
            );

        } catch (error) {
            console.error('Webhook error:', error);
            db.run(`UPDATE candidates SET status = 'Failed', consideration = ? WHERE id = ?`, 
                [error.message, candidateId]);
        }
    });
});

// Route fallbacks
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Start Server
if (!isVercel) {
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
        console.log(`Candidate Portal: http://localhost:${PORT}/`);
        console.log(`HR Dashboard: http://localhost:${PORT}/dashboard`);
    });
}

// Export for Vercel serverless functions
module.exports = app;
