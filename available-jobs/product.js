document.querySelectorAll("[data-current-year]").forEach(node=>node.textContent=new Date().getFullYear());
const showError=(node,message)=>{node.textContent=message;node.style.display="block"};
const splitList=value=>String(value||"").split(/[,\n]/).map(item=>item.trim()).filter(Boolean);

const signupForm=document.querySelector("#signupForm");
if(signupForm){
  let step=1;
  const steps=[...signupForm.querySelectorAll(".form-step")];
  const progress=[...document.querySelectorAll(".progress span")];
  const submit=signupForm.querySelector('[type="submit"]');
  const error=document.querySelector("#signupError");
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
  signupForm.addEventListener("submit",async event=>{
    event.preventDefault();
    error.style.display="none";submit.disabled=true;submit.textContent="Creating account…";
    const data=new FormData(signupForm);
    const profile={
      name:data.get("name"),
      roles:splitList(data.get("targetRoles")),
      skills:splitList(data.get("skills")),
      seniority:data.getAll("seniority"),
      industries:splitList(data.get("industries")),
      location:data.get("location"),
      work_modes:data.getAll("workModes"),
      dealbreakers:data.get("dealbreakers")
    };
    try{
      const result=await window.HabibiAuth.signUp({email:data.get("email"),password:data.get("password"),profile});
      if(!result.access_token){
        signupForm.querySelectorAll(".form-step,.progress").forEach(item=>item.style.display="none");
        const success=document.querySelector("#signupSuccess");success.classList.add("show");
        success.querySelector("h2").textContent="Check your email to continue.";
        success.querySelector("p").textContent="Confirm your email, then sign in to finish activating your account.";
        success.querySelector("a").href="./login.html";success.querySelector("a").textContent="Go to sign in →";return;
      }
      await window.HabibiAuth.saveProfile(profile);
      const settings=await window.HabibiAuth.config();
      if(settings.billingConfigured)await window.HabibiAuth.checkout();else window.location.href="./dashboard.html?welcome=1";
    }catch(reason){showError(error,reason.message)}finally{submit.disabled=false;submit.textContent="Create account & continue →"}
  });
}

const loginForm=document.querySelector("#loginForm");
if(loginForm){
  const error=document.querySelector("#loginError"),button=loginForm.querySelector('[type="submit"]');
  loginForm.addEventListener("submit",async event=>{
    event.preventDefault();
    error.style.display="none";button.disabled=true;button.textContent="Signing in…";
    try{await window.HabibiAuth.signIn(loginForm.elements.email.value,loginForm.elements.password.value);window.location.href="./dashboard.html"}
    catch(reason){showError(error,reason.message)}finally{button.disabled=false;button.textContent="Sign in →"}
  });
}
