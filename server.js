const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// TEST ROUTE (no DB)
app.get('/', (req,res)=>{
  res.send("Server running OK");
});

app.listen(process.env.PORT || 3000, ()=>{
  console.log("Server started");
});
