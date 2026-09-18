(()=>{
  const sessionKey="habibiJobsSessionV1";
  const settings={configured:true,supabaseUrl:"https://mjmwfocpswpvqtmuxiqv.supabase.co",supabaseAnonKey:"sb_publishable_cUZXQpFpkd_fPW1Pq26XNA_4gonU8XR",apiBase:"https://mjmwfocpswpvqtmuxiqv.supabase.co/functions/v1/jobs-api",billingProvider:"lemon_squeezy",billingConfigured:false,plan:{name:"Founding plan",price:"$9/month",trialDays:14}};
  const config=async()=>settings;
  const readSession=()=>{try{return JSON.parse(localStorage.getItem(sessionKey)||"null")}catch{return null}};
  const writeSession=session=>session?localStorage.setItem(sessionKey,JSON.stringify(session)):localStorage.removeItem(sessionKey);
  const hash=new URLSearchParams(location.hash.replace(/^#/,""));
  if(hash.get("access_token")){
    writeSession({access_token:hash.get("access_token"),refresh_token:hash.get("refresh_token"),expires_in:Number(hash.get("expires_in")||3600),expires_at:Math.floor(Date.now()/1000)+Number(hash.get("expires_in")||3600),token_type:"bearer"});
    history.replaceState(null,"",location.pathname+location.search);
  }
  const authRequest=async(path,body)=>{
    const settings=await config();
    if(!settings.configured)throw new Error("Account setup is not active yet.");
    const response=await fetch(`${settings.supabaseUrl}/auth/v1/${path}`,{method:"POST",headers:{apikey:settings.supabaseAnonKey,"content-type":"application/json"},body:JSON.stringify(body)});
    const result=await response.json();
    if(!response.ok)throw new Error(result.msg||result.error_description||result.message||"Authentication failed.");
    return result;
  };
  const refresh=async session=>{const result=await authRequest("token?grant_type=refresh_token",{refresh_token:session.refresh_token});writeSession(result);return result};
  const getSession=async()=>{
    let session=readSession();if(!session)return null;
    const expiresAt=Number(session.expires_at||0)*1000;
    if(expiresAt&&expiresAt-Date.now()<60000){try{session=await refresh(session)}catch{writeSession(null);return null}}
    return session;
  };
  const api=async(path,options={})=>{
    const session=await getSession();if(!session)throw new Error("Please sign in first.");
    const response=await fetch(`${settings.apiBase}${path}`,{...options,headers:{authorization:`Bearer ${session.access_token}`,"content-type":"application/json",...(options.headers||{})}});
    const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"The request failed.");return result;
  };
  window.HabibiAuth={
    config,getSession,
    async signUp({email,password,profile}){const redirect=`${location.origin}/available-jobs/dashboard.html`;const result=await authRequest(`signup?redirect_to=${encodeURIComponent(redirect)}`,{email,password,data:profile});if(result.access_token)writeSession(result);return result},
    async signIn(email,password){const result=await authRequest("token?grant_type=password",{email,password});writeSession(result);return result},
    async requestPasswordReset(email){const redirect=`${location.origin}/available-jobs/reset-password.html`;return authRequest(`recover?redirect_to=${encodeURIComponent(redirect)}`,{email})},
    async updatePassword(password){const session=await getSession();if(!session)throw new Error("The reset link is invalid or expired.");const settings=await config();const response=await fetch(`${settings.supabaseUrl}/auth/v1/user`,{method:"PUT",headers:{apikey:settings.supabaseAnonKey,authorization:`Bearer ${session.access_token}`,"content-type":"application/json"},body:JSON.stringify({password})});const result=await response.json();if(!response.ok)throw new Error(result.message||"Password update failed.");return result},
    signOut(){writeSession(null);window.location.href="./login.html"},
    getProfile:()=>api("/profile"),saveProfile:profile=>api("/profile",{method:"PUT",body:JSON.stringify(profile)}),
    getFeedback:()=>api("/feedback"),saveFeedback:feedback=>api("/feedback",{method:"PUT",body:JSON.stringify(feedback)}),
    async checkout(){const result=await api("/create-checkout-session",{method:"POST"});window.location.href=result.url},
    async portal(){const result=await api("/create-portal-session",{method:"POST"});window.location.href=result.url}
  };
})();
