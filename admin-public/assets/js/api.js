const API_BASE = "https://api.philcasting.com";
const LS_KEY = "pc_admin_auth";   // separate from user session

function getAuth(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||"null"); }catch(e){ return null; } }
function setAuth(d){ localStorage.setItem(LS_KEY, JSON.stringify(d)); }
function clearAuth(){ localStorage.removeItem(LS_KEY); }

async function api(path, { method = "GET", body } = {}){
  const token = getAuth()?.token;
  const res = await fetch(API_BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if(res.status === 401){ clearAuth(); if(typeof showLogin === "function") showLogin(); throw new Error("Session expired"); }
  if(!res.ok) throw new Error(data.error || ("HTTP " + res.status));
  return data;
}

let _tt;
function toast(msg, err){
  const t = document.getElementById("toast");
  if(!t) return;
  t.textContent = msg; t.classList.toggle("err", !!err); t.classList.add("show");
  clearTimeout(_tt); _tt = setTimeout(() => t.classList.remove("show"), 4000);
}
const fmtKES = n => "KES " + Number(n||0).toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtInt = n => Number(n||0).toLocaleString();
const fmtDate = d => new Date(d).toLocaleString("en-KE",{dateStyle:"medium",timeStyle:"short"});
