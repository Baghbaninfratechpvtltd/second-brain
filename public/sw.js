function showTab(tab){
  const s={
    dashboard:"dashSection",
    notes:"notesSection",
    chat:"chatSection",
    tasks:"tasksSection",
    reminder:"reminderSection",
    translate:"translateSection",
    ocr:"ocrSection",
    news:"newsSection"
  };

  const t={
    dashboard:"t1",
    notes:"t2",
    chat:"t3",
    tasks:"t4",
    reminder:"t5",
    translate:"t6",
    ocr:"t7",
    news:"t8"
  };

  Object.values(s).forEach(x=>{
    const el=document.getElementById(x);
    if(el) el.style.display="none";
  });

  Object.values(t).forEach(x=>{
    const el=document.getElementById(x);
    if(el) el.classList.remove("active");
  });

  if(document.getElementById(s[tab]))
    document.getElementById(s[tab]).style.display="block";

  if(document.getElementById(t[tab]))
    document.getElementById(t[tab]).classList.add("active");
}
