const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const app = express();

// --- 1. SETTINGS & LIMITS ---
app.use(cors({
    origin: 'https://sro.eslskill.in'
}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- 2. DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 5000 
})
  .then(() => console.log("✅ MongoDB Connected!"))
  .catch(err => console.log("❌ Connection Error:", err));

// --- 3. MODELS (All Models Must Be Defined Before Routes) ---

const Course = mongoose.model('Course', new mongoose.Schema({
    courseName: String,
    duration: String,
    fees: Number,
    subjects: Array
}));

const studentSchema = new mongoose.Schema({
    enrollmentNo: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    name: String,
    fatherName: String, 
    motherName: String, 
    dob: String,
    gender: String, 
    email: String, 
    phone: String, 
    guardianPhone: String,
    address: String, 
    state: String, 
    pincode: String, 
    qualification: String,
    course: String, 
    batchTime: String, 
    admissionDate: String,
    sessionStart: String, 
    sessionEnd: String,
    photoUrl: String, 
    paidFee: { type: Number, default: 0 }, 
    status: { type: String, default: 'Active' },
    createdAt: { type: Date, default: Date.now }
});
const Student = mongoose.model('Student', studentSchema);

const FeeTransaction = mongoose.model('FeeTransaction', new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    amount: Number,
    date: String,
    narration: String,
    createdAt: { type: Date, default: Date.now }
}));

const certificateSchema = new mongoose.Schema({
    certificateNo: { type: String, unique: true, required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    studentName: String,
    enrollmentNo: String,
    courseName: String,
    issueDate: { type: String, default: () => new Date().toISOString().split('T')[0] },
    marks: {
        theory: Number,
        practical: Number,
        project: Number,
        viva: Number
    },
    percentage: Number,
    grade: String
});
const Certificate = mongoose.model('Certificate', certificateSchema);

// --- 4. API ROUTES ---

// Dashboard Stats
app.get('/api/stats', async (req, res) => {
    try {
        const totalStudents = await Student.countDocuments();
        const totalCerts = await Certificate.countDocuments();

        // Pending Fees Logic - Fixed 'paidFee' field name
        const students = await Student.find({}, 'paidFee course'); 
        
        // Note: 'totalFees' calculation depends on Course model in a real scenario, 
        // using your existing logic with fixed field names.
        const pendingFees = students.reduce((acc, student) => {
            const balance = (Number(student.totalFees) || 0) - (Number(student.paidFee) || 0);
            return acc + (balance > 0 ? balance : 0);
        }, 0);

        res.json({
            totalStudents,
            totalCerts,
            totalFees: pendingFees 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- STUDENT ROUTES ---
app.post('/api/students', async (req, res) => {
    try {
        const newStudent = new Student(req.body);
        await newStudent.save();
        res.status(201).json({ success: true, message: "Registered!", student: newStudent });
    } catch (err) {
        console.error("Student Registration Error:", err.message);
        res.status(400).json({ error: err.message });
    }
});

app.get('/api/students', async (req, res) => {
    try {
        const students = await Student.find().sort({ createdAt: -1 });
        res.json(students);
    } catch (err) { res.status(500).json(err); }
});

app.get('/api/students/search', async (req, res) => {
    try {
        const { query } = req.query;
        const students = await Student.find({
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { enrollmentNo: { $regex: query, $options: 'i' } }
            ]
        }).limit(10);
        res.json(students);
    } catch (error) {
        res.status(500).json({ error: "Search failed" });
    }
});

app.get('/api/students/:id', async (req, res) => {
    try {
        const student = await Student.findById(req.params.id);
        if (!student) return res.status(404).json({ error: "Student not found" });
        res.json(student);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
});

app.put('/api/students/:id', async (req, res) => {
    try {
        const updated = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updated);
    } catch (err) { res.status(400).json({ error: "Update failed" }); }
});

app.delete('/api/students/:id', async (req, res) => {
    try {
        await Student.findByIdAndDelete(req.params.id);
        res.json({ message: "Student deleted" });
    } catch (err) { res.status(500).json({ error: "Delete failed" }); }
});

// --- FEES ROUTES ---
app.post('/api/fees/collect', async (req, res) => {
    const { studentId, amount, date, narration } = req.body;
    try {
        const newFee = new FeeTransaction({
            studentId, amount: parseFloat(amount), date, narration: narration || "Fee Payment"
        });
        await newFee.save();
        const updatedStudent = await Student.findByIdAndUpdate(
            studentId, { $inc: { paidFee: parseFloat(amount) } }, { new: true }
        );
        res.json({ message: "Success", paidFee: updatedStudent.paidFee });
    } catch (error) { res.status(500).json({ error: "Payment failed" }); }
});

app.get('/api/fees/history/:studentId', async (req, res) => {
    try {
        const history = await FeeTransaction.find({ studentId: req.params.studentId }).sort({ createdAt: -1 });
        res.json(history);
    } catch (error) { res.status(500).json({ error: "History fetch error" }); }
});

app.delete('/api/fees/transaction/:id', async (req, res) => {
    try {
        const tx = await FeeTransaction.findById(req.params.id);
        if (!tx) return res.status(404).json({ error: "Not found" });
        await Student.findByIdAndUpdate(tx.studentId, { $inc: { paidFee: -tx.amount } });
        await FeeTransaction.findByIdAndDelete(req.params.id);
        res.json({ message: "Deleted" });
    } catch (err) { res.status(500).json({ error: "Delete failed" }); }
});

// --- COURSE ROUTES ---
app.get('/api/courses', async (req, res) => {
    try {
        const courses = await Course.find();
        res.json(courses);
    } catch (err) { res.status(500).json(err); }
});

app.post('/api/courses', async (req, res) => {
    try {
        const newCourse = new Course(req.body);
        const savedCourse = await newCourse.save();
        res.status(201).json({ success: true, message: "Course saved!", course: savedCourse });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

app.put('/api/courses/:id', async (req, res) => {
    try {
        const updated = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updated);
    } catch (err) { res.status(400).json(err); }
});

app.delete('/api/courses/:id', async (req, res) => {
    try {
        await Course.findByIdAndDelete(req.params.id);
        res.json({ message: "Course deleted" });
    } catch (err) { res.status(500).json(err); }
});

app.get('/api/courses/name/:name', async (req, res) => {
    try {
        const queryName = decodeURIComponent(req.params.name).trim();
        const course = await Course.findOne({ 
            courseName: { $regex: new RegExp(`^${queryName}$`, 'i') } 
        });
        if (!course) return res.status(404).json({ message: "Course not found" });
        res.json(course);
    } catch (err) { res.status(500).json({ error: "Server error" }); }
});

// --- CERTIFICATE ROUTES ---
app.post('/api/certificates/issue', async (req, res) => {
    try {
        const { enrollmentNo, studentName } = req.body;
        const existingCert = await Certificate.findOne({ enrollmentNo });
        if (existingCert) {
            return res.status(400).json({ 
                success: false, 
                message: `⚠️ Certificate already issued for ${studentName} (${enrollmentNo})` 
            });
        }
        const newCert = new Certificate(req.body);
        await newCert.save();
        res.status(201).json({ 
            success: true, 
            message: "✅ Certificate Issued Successfully!", 
            data: newCert 
        });
    } catch (err) {
        console.error("Issue Certificate Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/certificates', async (req, res) => {
    const certs = await Certificate.find().sort({ _id: -1 });
    res.json(certs);
});

app.delete('/api/certificates/:id', async (req, res) => {
    try {
        await Certificate.findByIdAndDelete(req.params.id);
        res.json({ message: "Certificate deleted successfully" });
    } catch (err) { res.status(500).json({ error: "Delete failed" }); }
});

app.get('/api/certificates/verify/:certNo', async (req, res) => {
    try {
        const cert = await Certificate.findOne({ certificateNo: req.params.certNo });
        if (!cert) return res.status(404).json({ success: false, message: "Invalid Certificate" });
        const student = await Student.findOne({ enrollmentNo: cert.enrollmentNo });
        const enrichedData = {
            ...cert._doc,
            studentPhoto: student?.photoUrl || null, 
            batch: cert.batch || student?.batchTime || "N/A",
            admissionDate: cert.admissionDate || student?.admissionDate || "N/A",
            fatherName: cert.fatherName || student?.fatherName || "N/A",
            dob: cert.dob || student?.dob || "N/A",
            session: student?.sessionStart && student?.sessionEnd ? `${student.sessionStart} - ${student.sessionEnd}` : "N/A"
        };
        res.json({ success: true, data: enrichedData });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- START SERVER ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
