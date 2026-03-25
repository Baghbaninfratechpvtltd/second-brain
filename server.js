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
    messages:[
      {role:"user",content:req.body.msg}
    ]
   })
  });

  const data = await response.json();

  console.log("AI RESPONSE:", data); // 🔥 DEBUG

  // ✅ अगर error आया तो वही दिखाओ
  if(data.error){
    return res.json({
      choices:[{message:{content:"AI ERROR: "+data.error.message}}]
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
  res.json({
    choices:[{message:{content:"Server AI crash"}}]
  });
 }
});
