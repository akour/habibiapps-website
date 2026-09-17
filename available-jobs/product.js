const accountKey="habibiJobsAccountV1";
const getAccount=()=>{try{return JSON.parse(localStorage.getItem(accountKey)||"null")}catch{return null}};
const saveAccount=value=>localStorage.setItem(accountKey,JSON.stringify(value));

document.querySelectorAll("[data-current-year]").forEach(node=>node.textContent=new Date().getFullYear());

const signupForm=document.querySelector("#signupForm");
if(signupForm){
  let step=1;
  const steps=[...signupForm.querySelectorAll(".form-step")];
  const progress=[...document.querySelectorAll(".progress span")];
  const showStep=next=>{step=next;steps.forEach(item=>item.hidden=Number(item.dataset.step)!==step);progress.forEach((item,index)=>item.classList.toggle("active",index<step));window.scrollTo({top:0,behavior:"smooth"})};
  signupForm.addEventListener("click",event=>{
    const next=event.target.closest("[data-next]");
    const back=event.target.closest("[data-back]");
    if(back){showStep(step-1);return}
    if(next){
      const current=steps.find(item=>Number(item.dataset.step)===step);
      const required=[...current.querySelectorAll("[required]")];
      if(required.some(input=>!input.reportValidity()))return;
      showStep(step+1);
    }
  });
  signupForm.addEventListener("submit",event=>{
    event.preventDefault();
    const data=new FormData(signupForm);
    const account={name:data.get("name"),email:data.get("email"),roles:data.getAll("roles"),location:data.get("location"),workModes:data.getAll("workModes"),dealbreakers:data.get("dealbreakers"),plan:"founding",status:"trial-requested",createdAt:new Date().toISOString()};
    saveAccount(account);
    signupForm.querySelectorAll(".form-step,.progress").forEach(item=>item.style.display="none");
    const success=document.querySelector("#signupSuccess");success.classList.add("show");
    document.querySelector("#successName").textContent=account.name.split(" ")[0]||"there";
  });
}

const loginForm=document.querySelector("#loginForm");
if(loginForm){
  const account=getAccount();
  if(account?.email)loginForm.elements.email.value=account.email;
  loginForm.addEventListener("submit",event=>{
    event.preventDefault();
    const saved=getAccount();
    const error=document.querySelector("#loginError");
    if(saved&&saved.email.toLowerCase()===loginForm.elements.email.value.toLowerCase()){window.location.href="./dashboard.html"}
    else{error.textContent="No local early-access account was found for this email. Create an account first."}
  });
}
