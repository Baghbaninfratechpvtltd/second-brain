const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

global.fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

mongoose.connect('mongodb+srv://ashuraza456_db_user:Ashu8648@second-brain.f1li8xg.mongodb.net/brain')
.then(()=>console.log("DB Connected"))
.catch(err=>console.log(err));

const User = mongoose.model('User',{email:String,password:String});
const Note = mongoose.model('Note',{userId:String,title:String,body:String});

app.get('/',(req,res)=>res.send("Server running OK"));

app.post('/signup', async (req,res)=>{
 try{ res.json(await User.create(req.body)); }
 catch{ res.json({error:"fail"}); }
});

app.post('/login', async (req,res)=>{
 try{ res.json(await User.findOne(req.body)); }
 catch{ res.json({error:"fail"}); }
});

app.post('/notes', async (req,res)=>{
 try{ res.json(await Note.create(req.body)); }
 catch{ res.json({error:"fail"}); }
});

app.get('/notes/:userId', async (req,res)=>{
 try{ res.json(await Note.find({userId:req.params.userId})); }
 catch{ res.json([]); }
});

app.post('/chat', async (req,res)=>{
 try{
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions",{
   method:"POST",
   headers:{
    "Authorization":"Bearer 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",
    "Content-Type":"application/json"
   },
   body:JSON.stringify({
    model:"mistralai/mistral-7b-instruct:free",
    messages:[{role:"user",content:req.body.msg}]
   })
  });

  const data = await response.json();

  res.json({
    choices:[{message:{content:data?.choices?.[0]?.message?.content || "No AI"}}]
  });

 }catch{
  res.json({choices:[{message:{content:"AI Error"}}]});
 }
});

app.listen(process.env.PORT || 3000);
