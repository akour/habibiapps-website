const splitList=value=>String(value||"").split(/[,\n]/).map(item=>item.trim()).filter(Boolean);
const joinList=value=>(value||[]).join(", ");
const profileForm=document.querySelector("#profileForm");
const resumeForm=document.querySelector("#resumeForm");
const profileStatus=document.querySelector("#profileStatus");
const resumeStatus=document.querySelector("#resumeStatus");
const resumeCurrent=document.querySelector("#resumeCurrent");
const deleteResumeButton=document.querySelector("#deleteResumeButton");
let currentProfile=null;

function showResume(profile){
  currentProfile=profile;
  resumeCurrent.textContent=profile?.resume_name?`Current file: ${profile.resume_name}`:"No resume uploaded.";
  deleteResumeButton.hidden=!profile?.resume_path;
}

function fill(profile){
  currentProfile=profile;
  profileForm.elements.name.value=profile.name||"";
  profileForm.elements.roles.value=joinList(profile.roles);
  profileForm.elements.skills.value=joinList(profile.skills);
  profileForm.elements.industries.value=joinList(profile.industries);
  profileForm.elements.location.value=profile.location||"Worldwide";
  profileForm.elements.dealbreakers.value=profile.dealbreakers||"";
  profileForm.elements.excludedCompanies.value=joinList(profile.excluded_companies);
  profileForm.elements.emailFrequency.value=profile.email_frequency||"daily";
  for(const input of profileForm.querySelectorAll('[name="seniority"]'))input.checked=(profile.seniority||[]).includes(input.value);
  for(const input of profileForm.querySelectorAll('[name="workModes"]'))input.checked=(profile.work_modes||[]).includes(input.value);
  showResume(profile);
}

profileForm.addEventListener("submit",async event=>{
  event.preventDefault();
  profileStatus.textContent="Saving…";
  const data=new FormData(profileForm);
  const profile={
    name:data.get("name"),
    roles:splitList(data.get("roles")),
    skills:splitList(data.get("skills")),
    seniority:data.getAll("seniority"),
    industries:splitList(data.get("industries")),
    location:data.get("location"),
    work_modes:data.getAll("workModes"),
    dealbreakers:data.get("dealbreakers"),
    excluded_companies:splitList(data.get("excludedCompanies")),
    email_frequency:data.get("emailFrequency")
  };
  try{
    const result=await window.HabibiAuth.saveProfile(profile);
    currentProfile={...currentProfile,...result.profile};
    profileStatus.textContent="Search profile saved. New titles will be included in the next discovery run.";
  }catch(error){profileStatus.textContent=error.message}
});

resumeForm.addEventListener("submit",async event=>{
  event.preventDefault();
  const file=resumeForm.elements.resume.files[0];
  if(!file){resumeStatus.textContent="Choose a PDF, DOCX or TXT file first.";return}
  resumeStatus.textContent="Uploading…";
  try{
    const result=await window.HabibiAuth.uploadResume(file);
    showResume(result.profile);
    resumeForm.reset();
    resumeStatus.textContent="Resume uploaded privately.";
  }catch(error){resumeStatus.textContent=error.message}
});

deleteResumeButton.addEventListener("click",async()=>{
  resumeStatus.textContent="Removing…";
  try{
    const result=await window.HabibiAuth.deleteResume();
    showResume(result.profile);
    resumeStatus.textContent="Resume removed.";
  }catch(error){resumeStatus.textContent=error.message}
});

(async()=>{
  const session=await window.HabibiAuth.getSession();
  if(!session){window.location.replace("./login.html");return}
  try{const account=await window.HabibiAuth.getProfile();fill(account.profile||{})}
  catch(error){profileStatus.textContent=error.message}
})();
