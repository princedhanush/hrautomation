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

// AI Generation removed as requested

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
