/* ======================= In-memory "database" ======================= */
/* No backend yet — everything here resets on page reload. Swap these
   arrays for real API calls once a server + database is in place. */

let RATE_PER_DAY = 110; // advance daily mess rate, in rupees — changeable by a Supervisor

function genAccountRef(enrol) {
  return 'DD-' + enrol.replace(/[^A-Za-z0-9]/g, '').toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

let students = [
  {
    id:'s1', name:'Ahmad Raza', enrollment:'GK-2314', hostel:'Sir Syed Hall (South)', room:'214',
    phone:'9812345670', password:'demo123', balanceDays:14, status:'active',
    accountRef: genAccountRef('GK-2314'), registeredOn:'2026-07-01', pausePeriods:[],
    payments:[
      {id:'p1', date:'2026-08-02', days:30, amount:30*RATE_PER_DAY, proofName:'upi_receipt_aug.jpg', status:'verified'}
    ],
    deficits:[
      {id:'d1', month:'2026-08', monthLabel:'August 2026', days:31, ratePerDay:5, amount:31*5, proofName:null, status:'due', appliedOn:'2026-08-15'}
    ],
    stopRequest:null
  },
  {
    id:'s2', name:'Zoya Fatima', enrollment:'GK-2381', hostel:'Abdullah Hall', room:'118',
    phone:'9812345671', password:'demo123', balanceDays:2, status:'active',
    accountRef: genAccountRef('GK-2381'), registeredOn:'2026-07-01', pausePeriods:[],
    payments:[
      {id:'p2', date:'2026-08-05', days:20, amount:20*RATE_PER_DAY, proofName:'sbi_txn_2381.jpg', status:'verified'}
    ],
    deficits:[
      {id:'d2', month:'2026-08', monthLabel:'August 2026', days:31, ratePerDay:5, amount:31*5, proofName:'gpay_deficit_aug.jpg', status:'submitted', appliedOn:'2026-09-01'}
    ],
    stopRequest:{fromDate:'2026-09-12', reason:'Going home for a week', status:'pending', requestedOn:'2026-08-28'}
  },
  {
    id:'s3', name:'Imran Siddiqui', enrollment:'GK-2260', hostel:'Sir Syed Hall (South)', room:'309',
    phone:'9812345672', password:'demo123', balanceDays:-4, status:'active',
    accountRef: genAccountRef('GK-2260'), registeredOn:'2026-07-01',
    pausePeriods:[{from:'2026-08-10', to:'2026-08-20'}], // stopped for 11 days mid-August
    payments:[
      {id:'p3', date:'2026-07-20', days:25, amount:25*RATE_PER_DAY, proofName:'phonepe_2260.jpg', status:'verified'}
    ],
    deficits:[
      {id:'d3', month:'2026-08', monthLabel:'August 2026', days:20, ratePerDay:5, amount:20*5, proofName:null, status:'due', appliedOn:'2026-09-01'}
    ],
    stopRequest:null
  }
];

let admins = [
  {id:'a1', name:'Naseem Ahmad (Munshi)', employeeId:'MUN-04', password:'admin123', role:'supervisor'},
  {id:'a2', name:'Rukhsar Jahan', employeeId:'STAFF-11', password:'staff123', role:'staff'}
];

let deficitRounds = [
  {id:'r1', month:'2026-08', monthLabel:'August 2026', ratePerDay:5, days:31, appliedOn:'2026-09-01'}
];

const SUPERVISOR_ACCESS_CODE = 'AMU-MESS-ADMIN';
const STAFF_ACCESS_CODE = 'AMU-MESS-STAFF';

/* ======================= App state ======================= */
const state = {
  currentStudentId:null,
  currentAdminId:null,
};

/* ======================= Helpers ======================= */
function $(id){ return document.getElementById(id); }
function today(){ return new Date().toISOString().slice(0,10); }
function currentStudent(){ return students.find(s=>s.id===state.currentStudentId); }
function currentAdmin(){ return admins.find(a=>a.id===state.currentAdminId); }
function isSupervisor(){ const a = currentAdmin(); return !!a && a.role==='supervisor'; }
function daysInMonth(monthValue){ // monthValue like "2026-09"
  const [y,m] = monthValue.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function monthLabel(monthValue){
  const [y,m] = monthValue.split('-').map(Number);
  return new Date(y, m-1, 1).toLocaleString('en-US',{month:'long', year:'numeric'});
}
function daysBetween(laterStr, earlierStr){
  return Math.round((new Date(laterStr) - new Date(earlierStr)) / 86400000);
}
function statusInfo(s){
  if(s.status==='stopped') return {label:'Dining stopped', cls:'stopped'};
  if(s.balanceDays<=0) return {label:'Balance expired', cls:'expired'};
  if(s.balanceDays<=5) return {label:'Running low', cls:'low'};
  return {label:'Active', cls:'active'};
}
function deficitDueTotal(s){
  return s.deficits.filter(d=>d.status!=='paid').reduce((sum,d)=>sum+d.amount,0);
}
function pausePeriods(s){ return s.pausePeriods || []; }
function isDiningRunningOn(s, dateStr){
  if(s.registeredOn && dateStr < s.registeredOn) return false;
  for(const p of pausePeriods(s)){
    const to = p.to || '9999-12-31';
    if(dateStr >= p.from && dateStr <= to) return false;
  }
  return true;
}
function runningDaysInMonth(s, monthValue){
  const totalDays = daysInMonth(monthValue);
  const todayStr = today();
  let count = 0;
  for(let d=1; d<=totalDays; d++){
    const dateStr = monthValue + '-' + String(d).padStart(2,'0');
    if(dateStr > todayStr) break; // don't bill for days that haven't happened yet
    if(isDiningRunningOn(s, dateStr)) count++;
  }
  return count;
}
function openPausePeriod(s, fromDate){
  if(!s.pausePeriods) s.pausePeriods = [];
  if(!s.pausePeriods.some(p=>p.to===null)) s.pausePeriods.push({from:fromDate, to:null});
}
function closePausePeriod(s, toDate){
  const open = pausePeriods(s).find(p=>p.to===null);
  if(open) open.to = toDate;
}
function isOverdue(d){
  return d.status==='due' && d.appliedOn && daysBetween(today(), d.appliedOn) >= 15;
}
function showView(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
  $(id).classList.remove('hidden');
  window.scrollTo({top:0,behavior:'instant'});
}
function renderHeroRate(){
  const el = $('heroRateNum');
  if(el) el.textContent = RATE_PER_DAY;
}

/* ======================= Navigation ======================= */
function goHome(){
  showView('view-landing');
  renderNav();
}
function openAuth(role, tab){
  if(role==='student'){
    showView('view-student-auth');
    switchTab('studentTabs', tab);
  } else {
    showView('view-admin-auth');
    switchTab('adminTabs', tab);
  }
  renderNav();
}
function switchTab(tabsId, tab){
  const container = $(tabsId);
  container.querySelectorAll('.tab').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.tab===tab);
  });
  if(tabsId==='studentTabs'){
    $('studentLoginForm').classList.toggle('hidden', tab!=='login');
    $('studentRegisterForm').classList.toggle('hidden', tab!=='register');
  } else {
    $('adminLoginForm').classList.toggle('hidden', tab!=='login');
    $('adminRegisterForm').classList.toggle('hidden', tab!=='register');
  }
}
document.addEventListener('click', (e)=>{
  if(e.target.classList.contains('tab')){
    const parentId = e.target.closest('.tabs').id;
    switchTab(parentId, e.target.dataset.tab);
  }
});

function renderNav(){
  const el = $('navActions');
  if(state.currentStudentId){
    const s = currentStudent();
    el.innerHTML = `<span class="nav-user">${s.name} · Student</span>
      <button class="btn btn-outline btn-sm" onclick="logout()">Log out</button>`;
  } else if(state.currentAdminId){
    const a = currentAdmin();
    el.innerHTML = `<span class="nav-user">${a.name} · Munshi office (${a.role==='supervisor'?'Supervisor':'Staff'})</span>
      <button class="btn btn-outline btn-sm" onclick="logout()">Log out</button>`;
  } else {
    el.innerHTML = `<button class="btn btn-outline btn-sm" onclick="openAuth('student','login')">Student login</button>
      <button class="btn btn-primary btn-sm" onclick="openAuth('admin','login')">Munshi login</button>`;
  }
}
function logout(){
  state.currentStudentId=null; state.currentAdminId=null;
  goHome();
}
$('navBrand').addEventListener('click', goHome);

function msg(containerId, type, text){
  $(containerId).innerHTML = `<div class="msg msg-${type}">${text}</div>`;
}
function clearMsg(containerId){ $(containerId).innerHTML=''; }

/* ======================= Student auth ======================= */
function studentLogin(){
  const enrol = $('loginEnrol').value.trim();
  const pass = $('loginPass').value;
  const s = students.find(x=>x.enrollment.toLowerCase()===enrol.toLowerCase() && x.password===pass);
  if(!s){ msg('studentAuthMsg','err','No match found. Check your enrolment number and password.'); return; }
  clearMsg('studentAuthMsg');
  state.currentStudentId = s.id;
  renderNav();
  renderStudentDash();
  showView('view-student-dash');
}
function studentRegister(){
  const name=$('regName').value.trim(), enrol=$('regEnrol').value.trim(), hostel=$('regHostel').value.trim(),
        room=$('regRoom').value.trim(), phone=$('regPhone').value.trim(), pass=$('regPass').value;
  if(!name||!enrol||!hostel||!room||!phone||!pass){ msg('studentAuthMsg','err','Please fill in every field.'); return; }
  if(students.some(x=>x.enrollment.toLowerCase()===enrol.toLowerCase())){
    msg('studentAuthMsg','err','That enrolment number is already registered — try logging in instead.'); return;
  }
  const s={id:'s'+Date.now(), name, enrollment:enrol, hostel, room, phone, password:pass,
           accountRef: genAccountRef(enrol), registeredOn: today(), pausePeriods:[],
           balanceDays:0, status:'active', payments:[], deficits:[], stopRequest:null};
  students.push(s);
  clearMsg('studentAuthMsg');
  state.currentStudentId = s.id;
  renderNav();
  renderStudentDash();
  showView('view-student-dash');
}

/* ======================= Admin auth ======================= */
function adminLogin(){
  const id=$('aLoginId').value.trim(), pass=$('aLoginPass').value;
  const a = admins.find(x=>x.employeeId.toLowerCase()===id.toLowerCase() && x.password===pass);
  if(!a){ msg('adminAuthMsg','err','No match found. Check your employee ID and password.'); return; }
  clearMsg('adminAuthMsg');
  state.currentAdminId=a.id;
  renderNav();
  renderAdminDash();
  showView('view-admin-dash');
}
function adminRegister(){
  const name=$('aRegName').value.trim(), id=$('aRegId').value.trim(), pass=$('aRegPass').value,
        code=$('aRegCode').value.trim(), role=($('aRegRole') ? $('aRegRole').value : 'staff');
  if(!name||!id||!pass||!code||!role){ msg('adminAuthMsg','err','Please fill in every field.'); return; }
  const expectedCode = role==='supervisor' ? SUPERVISOR_ACCESS_CODE : STAFF_ACCESS_CODE;
  if(code!==expectedCode){
    msg('adminAuthMsg','err', `That access code isn't valid for a ${role==='supervisor'?'Supervisor':'Staff'} account. Ask the provost office for the current code.`);
    return;
  }
  if(admins.some(x=>x.employeeId.toLowerCase()===id.toLowerCase())){
    msg('adminAuthMsg','err','That employee ID is already registered — try logging in instead.'); return;
  }
  const a={id:'a'+Date.now(), name, employeeId:id, password:pass, role};
  admins.push(a);
  clearMsg('adminAuthMsg');
  state.currentAdminId=a.id;
  renderNav();
  renderAdminDash();
  showView('view-admin-dash');
}

/* ======================= Student dashboard ======================= */
function renderStudentDash(){
  const s = currentStudent();
  if(!s) return;
  const info = statusInfo(s);
  const amount = s.balanceDays>0 ? s.balanceDays*RATE_PER_DAY : 0;

  $('sGreeting').textContent = 'Welcome, ' + s.name.split(' ')[0];
  $('sSubline').textContent = `${s.hostel} · Room ${s.room} · Enrolment ${s.enrollment}`;
  $('sStatusBadge').outerHTML = `<span class="badge badge-${info.cls}" id="sStatusBadge">${info.label}</span>`;
  $('sDaysValue').textContent = s.balanceDays;
  $('sBalanceValue').textContent = '₹'+amount;
  $('sRateValue').textContent = '₹'+RATE_PER_DAY;

  renderStudentBanner(s);
  updatePayAmount();
  $('payRefNote').innerHTML = `Use this reference in your UPI payment remarks: <span class="ref-chip">${s.accountRef}</span>`;
  renderDeficitList(s);
  renderPauseContainer(s);
  renderPaymentHistory(s);
}

function renderStudentBanner(s){
  const el = $('sBanner');
  if(!el) return;
  const items = [];
  if(s.status==='stopped'){
    items.push({type:'info', text:'Your dining is currently stopped. Ask the Munshi office to resume it when you\'re back.'});
  } else if(s.balanceDays<=0){
    items.push({type:'danger', text:'Your dining balance has run out — pay for more days below to keep your account active.'});
  } else if(s.balanceDays<=5){
    items.push({type:'warn', text:`Only ${s.balanceDays} day(s) left on your balance — top up soon to avoid a gap.`});
  }
  const dueAmt = deficitDueTotal(s);
  if(dueAmt>0){
    const overdue = s.deficits.some(isOverdue);
    items.push({type: overdue?'danger':'warn', text:`₹${dueAmt} in deficit dues is pending${overdue?' and overdue':''} — settle it under Deficit dues.`});
  }
  if(s.stopRequest && s.stopRequest.status==='rejected'){
    items.push({type:'danger', text:'Your last pause request was rejected by the Munshi office.'});
  }
  el.innerHTML = items.map(m=>`<div class="banner banner-${m.type}">${m.text}</div>`).join('');
}

function updatePayAmount(){
  const days = parseInt($('payDays').value,10);
  $('payAmountDisplay').value = '₹'+(days*RATE_PER_DAY);
}
$('payDays').addEventListener('change', updatePayAmount);

function submitPayment(){
  const s = currentStudent();
  const days = parseInt($('payDays').value,10);
  const fileInput = $('payProof');
  if(!fileInput.files.length){ msg('payMsg','err','Please attach a payment screenshot before submitting.'); return; }
  const proofName = fileInput.files[0].name;
  s.payments.push({id:'p'+Date.now(), date:today(), days, amount:days*RATE_PER_DAY, proofName, status:'pending'});
  fileInput.value='';
  msg('payMsg','ok','Payment submitted. It will reflect in your balance once the Munshi office verifies it.');
  renderPaymentHistory(s);
}

function renderDeficitList(s){
  const el = $('deficitList');
  if(s.deficits.length===0){ el.innerHTML = `<p class="empty-note">No deficit charges on your account right now.</p>`; return; }
  el.innerHTML = s.deficits.slice().reverse().map(d=>`
    <div class="deficit-card">
      <div class="deficit-card-info">
        <p class="deficit-card-month">${d.monthLabel}</p>
        <p class="deficit-card-detail">${d.days} active day${d.days===1?'':'s'} × ₹${d.ratePerDay}/day</p>
      </div>
      <div class="deficit-card-actions">
        <span class="deficit-card-amount">₹${d.amount}</span>
        <span class="badge badge-${d.status}">${d.status}</span>
        ${isOverdue(d) ? `<span class="badge badge-overdue">overdue</span>` : ''}
        ${d.status==='due' ? `<button class="btn btn-primary btn-sm" onclick="payDeficit('${d.id}')">Pay now</button>` : ''}
      </div>
    </div>`).join('');
}
function payDeficit(deficitId){
  const s = currentStudent();
  const d = s.deficits.find(x=>x.id===deficitId);
  if(!d) return;
  const fileName = window.prompt('Enter your payment proof file name (e.g. upi_deficit_sep.jpg) to submit this for verification:');
  if(!fileName) return;
  d.status='submitted';
  d.proofName=fileName;
  renderDeficitList(s);
}

function renderPauseContainer(s){
  const el = $('pauseContainer');
  if(s.stopRequest){
    el.innerHTML = `
      <div class="pause-card">
        <p><strong>Requested from ${s.stopRequest.fromDate}</strong> — <span class="badge badge-${s.stopRequest.status}">${s.stopRequest.status}</span></p>
        ${s.stopRequest.reason ? `<p class="hint">Reason: ${s.stopRequest.reason}</p>` : ''}
      </div>`;
  } else {
    el.innerHTML = `
      <div class="field-grid">
        <div class="field"><label>Stop dining from</label><input id="stopDate" type="date" min="${today()}"></div>
        <div class="field"><label>Reason (optional)</label><input id="stopReason" placeholder="e.g. Going home"></div>
      </div>
      <button class="btn btn-outline" onclick="requestStop()">Request to stop</button>`;
  }
}
function requestStop(){
  const s = currentStudent();
  const date = $('stopDate').value;
  if(!date){ alert('Please choose a date to stop dining from.'); return; }
  s.stopRequest = {fromDate:date, reason:$('stopReason').value.trim(), status:'pending', requestedOn:today()};
  renderPauseContainer(s);
}

function renderPaymentHistory(s){
  const el = $('paymentHistoryContainer');
  if(s.payments.length===0){ el.innerHTML = `<p class="empty-note">No payments recorded yet.</p>`; return; }
  const rows = s.payments.slice().reverse().map(p=>`
    <tr>
      <td>${p.date}</td>
      <td>${p.days} days</td>
      <td>₹${p.amount}</td>
      <td>${p.proofName}</td>
      <td><span class="badge badge-${p.status}">${p.status}</span></td>
      <td><button class="btn btn-outline btn-sm" onclick="printReceipt('${s.id}','${p.id}')">Receipt</button></td>
    </tr>`).join('');
  el.innerHTML = `<div class="table-scroll"><table>
    <thead><tr><th>Date</th><th>Days</th><th>Amount</th><th>Proof file</th><th>Status</th><th>Receipt</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

/* ---- Printable receipts & account statement ---- */
function openPrint(html){
  $('printSheet').innerHTML = html;
  $('printModal').classList.remove('hidden');
}
function closePrint(){
  $('printModal').classList.add('hidden');
}
function printReceipt(sid, pid){
  const s = students.find(x=>x.id===sid);
  const p = s && s.payments.find(x=>x.id===pid);
  if(!s||!p) return;
  openPrint(`
    <h2>DineDesk — Payment Receipt</h2>
    <p class="hint">Generated ${today()}</p>
    <hr>
    <p><strong>${s.name}</strong> · ${s.enrollment}<br>${s.hostel}, Room ${s.room}</p>
    <p>Account reference: <span class="ref-chip">${s.accountRef}</span></p>
    <hr>
    <p>Payment date: ${p.date}</p>
    <p>Days paid: ${p.days}</p>
    <p>Amount: ₹${p.amount}</p>
    <p>Status: ${p.status}</p>
    <p>Proof on file: ${p.proofName}</p>
    <hr>
    <p class="hint">This is a prototype receipt — no real payment was processed.</p>
  `);
}
function printStatement(sid){
  const s = students.find(x=>x.id===sid) || currentStudent();
  if(!s) return;
  const payRows = s.payments.map(p=>`<tr><td>${p.date}</td><td>${p.days}</td><td>₹${p.amount}</td><td>${p.status}</td></tr>`).join('') || '<tr><td colspan="4">No payments</td></tr>';
  const defRows = s.deficits.map(d=>`<tr><td>${d.monthLabel}</td><td>${d.days}</td><td>₹${d.amount}</td><td>${d.status}</td></tr>`).join('') || '<tr><td colspan="4">No deficit charges</td></tr>';
  const totalPaid = s.payments.filter(p=>p.status==='verified').reduce((sum,p)=>sum+p.amount,0);
  openPrint(`
    <h2>DineDesk — Account Statement</h2>
    <p class="hint">Generated ${today()}</p>
    <hr>
    <p><strong>${s.name}</strong> · ${s.enrollment}<br>${s.hostel}, Room ${s.room}</p>
    <p>Account reference: <span class="ref-chip">${s.accountRef}</span></p>
    <p>Current day balance: ${s.balanceDays} days</p>
    <hr>
    <h3>Payments</h3>
    <table><thead><tr><th>Date</th><th>Days</th><th>Amount</th><th>Status</th></tr></thead><tbody>${payRows}</tbody></table>
    <h3 class="section-gap">Deficit charges</h3>
    <table><thead><tr><th>Month</th><th>Days billed</th><th>Amount</th><th>Status</th></tr></thead><tbody>${defRows}</tbody></table>
    <hr>
    <p><strong>Total verified payments:</strong> ₹${totalPaid}</p>
    <p><strong>Deficit dues outstanding:</strong> ₹${deficitDueTotal(s)}</p>
    <p class="hint">This is a prototype statement — no real payment was processed.</p>
  `);
}

/* ======================= Admin dashboard ======================= */
function renderAdminDash(){
  const a = currentAdmin();
  const supervisor = isSupervisor();
  $('aSubline').textContent = `Logged in as ${a.name} (${a.employeeId}) · ${supervisor?'Supervisor':'Staff'}`;

  const pendingPayments = students.reduce((n,s)=>n+s.payments.filter(p=>p.status==='pending').length,0);
  const pendingStops = students.filter(s=>s.stopRequest && s.stopRequest.status==='pending').length;
  const expiredActive = students.filter(s=>s.balanceDays<=0 && s.status==='active').length;
  const deficitDue = students.reduce((sum,s)=>sum+deficitDueTotal(s),0);
  const overdueCount = students.filter(s=>s.deficits.some(isOverdue)).length;

  $('aStatPendingPay').textContent = pendingPayments;
  $('aStatPendingStop').textContent = pendingStops;
  $('aStatExpired').textContent = expiredActive;
  $('aStatDeficitDue').textContent = '₹'+deficitDue;
  if($('aStatOverdue')) $('aStatOverdue').textContent = overdueCount;

  if($('aRoleBanner')){
    $('aRoleBanner').innerHTML = supervisor ? '' :
      `<div class="banner banner-info">You're signed in as Staff — you can verify payments, verify deficit payments, and manage stop requests, but only a Supervisor account can change the dining rate or apply a monthly deficit round.</div>`;
  }
  if($('updateRateBtn')) $('updateRateBtn').disabled = !supervisor;
  if($('applyDeficitBtn')) $('applyDeficitBtn').disabled = !supervisor;

  populateHostelFilter();
  renderStudentsTable();
  renderDeficitRounds();
  renderDeficitPayments();
  renderHostelReport();
  $('currentRateDisplay').value = '₹'+RATE_PER_DAY;
}

function updateRate(){
  if(!isSupervisor()){ msg('rateMsg','err','Only a Supervisor account can change the dining rate.'); return; }
  const newRate = parseFloat($('newRateInput').value);
  if(!newRate || newRate<=0){
    msg('rateMsg','err','Enter a valid rate greater than 0.');
    return;
  }
  const oldRate = RATE_PER_DAY;
  RATE_PER_DAY = newRate;
  $('newRateInput').value='';
  msg('rateMsg','ok', `Daily rate updated from ₹${oldRate} to ₹${newRate}. New payments will use this rate.`);
  renderAdminDash();
  renderHeroRate();
}

/* ---- Search / filter / export ---- */
function filteredStudents(){
  const q = ($('aSearchInput') ? $('aSearchInput').value : '').trim().toLowerCase();
  const statusF = $('aStatusFilter') ? $('aStatusFilter').value : 'all';
  const hostelF = $('aHostelFilter') ? $('aHostelFilter').value : 'all';
  return students.filter(s=>{
    if(q && !(s.name.toLowerCase().includes(q) || s.enrollment.toLowerCase().includes(q) || s.hostel.toLowerCase().includes(q))) return false;
    if(statusF!=='all' && statusInfo(s).cls!==statusF) return false;
    if(hostelF!=='all' && s.hostel!==hostelF) return false;
    return true;
  });
}
function populateHostelFilter(){
  const sel = $('aHostelFilter');
  if(!sel) return;
  const current = sel.value;
  const hostels = [...new Set(students.map(s=>s.hostel))].sort();
  sel.innerHTML = `<option value="all">All hostels</option>` + hostels.map(h=>`<option value="${h}">${h}</option>`).join('');
  if(hostels.includes(current)) sel.value = current;
}
function exportStudentsCSV(){
  const header = ['Name','Enrolment','Hostel','Room','Phone','Status','Days left','Deficit due (Rs)','Total verified paid (Rs)'];
  const rows = filteredStudents().map(s=>[
    s.name, s.enrollment, s.hostel, s.room, s.phone, statusInfo(s).label, s.balanceDays,
    deficitDueTotal(s),
    s.payments.filter(p=>p.status==='verified').reduce((sum,p)=>sum+p.amount,0)
  ]);
  const csv = [header, ...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `dinedesk-students-${today()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function bulkAcceptOldStops(){
  if(!isSupervisor()){ alert('Only a Supervisor account can bulk-accept stop requests.'); return; }
  let count=0;
  students.forEach(s=>{
    if(s.stopRequest && s.stopRequest.status==='pending' && s.stopRequest.requestedOn && daysBetween(today(), s.stopRequest.requestedOn)>=3){
      s.stopRequest.status='accepted';
      s.status='stopped';
      openPausePeriod(s, s.stopRequest.fromDate);
      count++;
    }
  });
  alert(count>0 ? `Accepted ${count} stop request(s) that had been pending 3+ days.` : 'No pending stop requests are 3 or more days old.');
  renderAdminDash();
}

function renderStudentsTable(){
  const el = $('studentsTableContainer');
  const list = filteredStudents();
  if(students.length===0){ el.innerHTML = `<p class="empty-note">No students registered yet.</p>`; return; }
  if(list.length===0){ el.innerHTML = `<p class="empty-note">No students match this search/filter.</p>`; return; }
  const rows = list.map(s=>{
    const info = statusInfo(s);
    const lastPay = s.payments[s.payments.length-1];
    const canDiscontinue = s.balanceDays<=0 && s.status==='active';
    const canResume = s.status==='stopped' && s.balanceDays>0;
    const dueAmt = deficitDueTotal(s);
    const overdue = s.deficits.some(isOverdue);
    let stopCell = '—';
    if(s.stopRequest){
      stopCell = `${s.stopRequest.fromDate}<br><span class="badge badge-${s.stopRequest.status}">${s.stopRequest.status}</span>`;
    }
    return `
    <tr>
      <td><strong>${s.name}</strong><br><span class="hint">${s.enrollment} · ${s.hostel}, Rm ${s.room}</span></td>
      <td>${s.balanceDays}</td>
      <td><span class="badge badge-${info.cls}">${info.label}</span></td>
      <td>${lastPay ? `${lastPay.proofName}<br><span class="badge badge-${lastPay.status}">${lastPay.status}</span>` : '—'}</td>
      <td>${dueAmt>0 ? `₹${dueAmt} ${overdue?'<span class="badge badge-overdue">overdue</span>':''}` : '—'}</td>
      <td>${stopCell}</td>
      <td class="row-actions">
        ${lastPay && lastPay.status==='pending' ? `<button class="btn btn-primary btn-sm" onclick="verifyPayment('${s.id}','${lastPay.id}')">Verify payment</button>` : ''}
        ${s.stopRequest && s.stopRequest.status==='pending' ? `
          <button class="btn btn-warn btn-sm" onclick="acceptStop('${s.id}')">Accept stop</button>
          <button class="btn btn-outline btn-sm" onclick="rejectStop('${s.id}')">Reject</button>` : ''}
        ${canDiscontinue ? `<button class="btn btn-danger btn-sm" onclick="discontinue('${s.id}')">Discontinue</button>` : ''}
        ${canResume ? `<button class="btn btn-primary btn-sm" onclick="resumeDining('${s.id}')">Resume</button>` : ''}
        <button class="btn btn-outline btn-sm" onclick="viewStudent('${s.id}')">History</button>
        <button class="btn btn-outline btn-sm" onclick="printStatement('${s.id}')">Statement</button>
      </td>
    </tr>`;
  }).join('');
  el.innerHTML = `<table>
    <thead><tr><th>Student</th><th>Days left</th><th>Status</th><th>Last payment</th><th>Deficit due</th><th>Stop request</th><th>Actions</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function verifyPayment(sid, pid){
  const s = students.find(x=>x.id===sid);
  const p = s.payments.find(x=>x.id===pid);
  if(!p || p.status!=='pending') return;
  p.status='verified';
  s.balanceDays += p.days;
  renderAdminDash();
}
function acceptStop(sid){
  const s = students.find(x=>x.id===sid);
  s.stopRequest.status='accepted';
  s.status='stopped';
  openPausePeriod(s, s.stopRequest.fromDate);
  renderAdminDash();
}
function rejectStop(sid){
  const s = students.find(x=>x.id===sid);
  s.stopRequest.status='rejected';
  renderAdminDash();
}
function discontinue(sid){
  const s = students.find(x=>x.id===sid);
  s.status='stopped';
  openPausePeriod(s, today());
  renderAdminDash();
}
function resumeDining(sid){
  const s = students.find(x=>x.id===sid);
  s.status='active';
  closePausePeriod(s, today());
  if(s.stopRequest) s.stopRequest=null;
  renderAdminDash();
}
function viewStudent(sid){
  const s = students.find(x=>x.id===sid);
  const payLines = s.payments.length ? s.payments.map(p=>`${p.date} · ${p.days} days · ₹${p.amount} · ${p.status}`).join('\n') : 'No payments yet';
  const defLines = s.deficits.length ? s.deficits.map(d=>`${d.monthLabel} · ₹${d.amount} · ${d.status}`).join('\n') : 'No deficit charges';
  alert(`${s.name} — ${s.enrollment}\n\nPayments:\n${payLines}\n\nDeficits:\n${defLines}`);
}

/* ---- Monthly deficit (fair split by logged dining days) ---- */
function applyDeficit(){
  if(!isSupervisor()){ msg('deficitApplyMsg','err','Only a Supervisor account can apply a deficit round.'); return; }
  const monthValue = $('deficitMonth').value;
  const rate = parseFloat($('deficitRate').value);
  if(!monthValue || !rate || rate<=0){
    msg('deficitApplyMsg','err','Choose a month and enter a valid deficit rate per day.');
    return;
  }
  const label = monthLabel(monthValue);

  if(deficitRounds.some(r=>r.month===monthValue)){
    msg('deficitApplyMsg','err',`A deficit round for ${label} has already been applied.`);
    return;
  }

  let billedCount = 0;
  students.forEach(s=>{
    const activeDays = runningDaysInMonth(s, monthValue);
    if(activeDays<=0) return; // no charge for a student whose dining wasn't running at all that month
    s.deficits.push({
      id:'d'+Date.now()+Math.random().toString(16).slice(2),
      month:monthValue, monthLabel:label, days:activeDays, ratePerDay:rate, amount:activeDays*rate,
      proofName:null, status:'due', appliedOn: today()
    });
    billedCount++;
  });
  deficitRounds.push({id:'r'+Date.now(), month:monthValue, monthLabel:label, ratePerDay:rate, days:daysInMonth(monthValue), appliedOn:today()});

  msg('deficitApplyMsg','ok', `Applied a ₹${rate}/day deficit for ${label}, billed to ${billedCount} of ${students.length} students for each day their dining was active that month.`);
  $('deficitRate').value='';
  renderAdminDash();
}

function renderDeficitRounds(){
  const el = $('deficitRoundsContainer');
  if(deficitRounds.length===0){ el.innerHTML = `<p class="empty-note">No deficit rounds applied yet.</p>`; return; }
  el.innerHTML = deficitRounds.slice().reverse().map(r=>`
    <div class="deficit-card">
      <div class="deficit-card-info">
        <p class="deficit-card-month">${r.monthLabel}</p>
        <p class="deficit-card-detail">Applied on ${r.appliedOn} · ${r.days} days in month (billed per student for their active days only)</p>
      </div>
      <span class="deficit-card-amount">₹${r.ratePerDay}/day</span>
    </div>`).join('');
}

function renderDeficitPayments(){
  const el = $('deficitPaymentsContainer');
  const submitted = [];
  students.forEach(s=>{
    s.deficits.filter(d=>d.status==='submitted').forEach(d=>submitted.push({student:s, deficit:d}));
  });
  if(submitted.length===0){ el.innerHTML = `<p class="empty-note">No deficit payments waiting on verification.</p>`; return; }
  const rows = submitted.map(({student,deficit})=>`
    <tr>
      <td>${student.name}<br><span class="hint">${student.enrollment}</span></td>
      <td>${deficit.monthLabel}</td>
      <td>₹${deficit.amount}</td>
      <td>${deficit.proofName}</td>
      <td><button class="btn btn-primary btn-sm" onclick="verifyDeficit('${student.id}','${deficit.id}')">Verify</button></td>
    </tr>`).join('');
  el.innerHTML = `<table>
    <thead><tr><th>Student</th><th>Month</th><th>Amount</th><th>Proof file</th><th>Action</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}
function verifyDeficit(sid, did){
  const s = students.find(x=>x.id===sid);
  const d = s.deficits.find(x=>x.id===did);
  if(!d || d.status!=='submitted') return;
  d.status='paid';
  renderAdminDash();
}

/* ---- Hostel-wise report ---- */
function renderHostelReport(){
  const el = $('hostelReportContainer');
  if(!el) return;
  const byHostel = {};
  students.forEach(s=>{
    if(!byHostel[s.hostel]) byHostel[s.hostel] = {count:0, activeCount:0, balanceDays:0, deficitDue:0, totalPaid:0};
    const b = byHostel[s.hostel];
    b.count++;
    if(s.status==='active') b.activeCount++;
    b.balanceDays += s.balanceDays;
    b.deficitDue += deficitDueTotal(s);
    b.totalPaid += s.payments.filter(p=>p.status==='verified').reduce((sum,p)=>sum+p.amount,0);
  });
  const hostels = Object.keys(byHostel).sort();
  if(hostels.length===0){ el.innerHTML = `<p class="empty-note">No students registered yet.</p>`; return; }
  const rows = hostels.map(h=>{
    const b = byHostel[h];
    return `<tr><td>${h}</td><td>${b.count}</td><td>${b.activeCount}</td><td>${b.balanceDays}</td><td>₹${b.deficitDue}</td><td>₹${b.totalPaid}</td></tr>`;
  }).join('');
  el.innerHTML = `<table>
    <thead><tr><th>Hostel</th><th>Students</th><th>Active</th><th>Total days left</th><th>Deficit due</th><th>Total verified paid</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

/* ======================= Init ======================= */
if($('aSearchInput')) $('aSearchInput').addEventListener('input', renderStudentsTable);
if($('aStatusFilter')) $('aStatusFilter').addEventListener('change', renderStudentsTable);
if($('aHostelFilter')) $('aHostelFilter').addEventListener('change', renderStudentsTable);

renderNav();
renderHeroRate();
