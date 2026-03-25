const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ✅ MongoDB connect (safe)
mongoose.connect('mongodb+srv://ashuraza456_db_user:Ashu8648@second-brain.f1li8xg.mongodb.net/brain')
.then(()=>console.log("DB Connected"))
.catch(err=>console.log(err));

// Models
const User = mongoose.model('User', {
  email: String,
  password: String
});

const Note = mongoose.model('Note', {
  userId: String,
  title: String,
  body: String
});

// Routes
app.post('/signup', async (req,res)=>{
  const user = await User.create(req.body);
  res.json(user);
});

app.post('/login', async (req,res)=>{
  const user = await User.findOne(req.body);
  res.json(user);
});

app.post('/notes', async (req,res)=>{
  const note = await Note.create(req.body);
  res.json(note);
});

app.get('/notes/:userId', async (req,res)=>{
  const notes = await Note.find({userId:req.params.userId});
  res.json(notes);
});

// TEST ROUTE (important)
app.get('/', (req,res)=>{
  res.send("Server running OK");
});

// ⚠️ IMPORTANT (Render fix)
const PORT = process.env.PORT || 3000;

app.listen(PORT, ()=>console.log("Server running on "+PORT));
