const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

// fetch support
global.fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

// MongoDB
mongoose.connect('mongodb+srv://ashuraza456_db_user:Ashu8648@second-brain.f1li8xg.mongodb.net/brain')
.then(()=>console.log("DB Connected"))
.catch(err=>console.log("DB Error:", err));

// Models
const User = mongoose.model('User',{email:String,password:String});
const Note = mongoose.model('Note',{userId:String,title:String,body:String});

// Test
app.get('/',(req,res)=>res.send("Server running OK"));

// Signup
app.post('/signup', async (req,res)=>{
 try{
  const user = await User.create(req.body);
  res.json(user);
 }catch(e){
  res.json({error:"Signup failed"});
 }
});

// Login
app.post('/login', async (req,res)=>{
 try{
  const user = await User.findOne(req.body);
  res.json(user);
 }catch(e){
  res.json({error:"Login failed"});
 }
});

// Notes
app.post('/notes', async (req,res)=>{
 try{
  const note = await Note.create(req.body);
  res.json(note);
 }catch(e){
  res.json({error:"Save failed"});
 }
});

app.get('/notes/:userId', async (req,res)=>{
 try{
  const notes = await Note.find({userId:req.params.userId});
  res.json(notes);
 }catch(e){
  res.json([]);
 }
});

// 🤖 AI DEBUG VERSION
app.post('/chat', async (req,res)=>{
 try{
  console.log("MSG:", req.body.msg);
  console.log("KEY:", process.env.OPENROUTER_API_KEY);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions",{
   method:"POST",
   headers:{
    "Authorization":"Bearer " + process.env.OPENROUTER_API_KEY,
    "Content-Type":"application/json"
   },
   body:JSON.stringify({
    model:"mistralai/mistral-7b-instruct:free",
    messages:[
      {role:"user",content:req.body.msg}
    ]
   })
  });

  const data = await response.json();

  console.log("AI DATA:", data);

  if(data.error){
    return res.json({
      choices:[{message:{content:"AI ERROR: " + data.error.message}}]
    });
  }

  res.json({
    choices:[{
      message:{
        content: data?.choices?.[0]?.message?.content || "No AI response"
      }
    }]
  });

 }catch(e){
  console.log("CRASH:", e);
  res.json({
    choices:[{message:{content:"Server crash"}}]
  });
 }
});

// PORT
app.listen(process.env.PORT || 3000, ()=>{
  console.log("Server started");
});
