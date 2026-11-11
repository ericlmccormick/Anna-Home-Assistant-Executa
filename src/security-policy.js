'use strict';

const MODES=Object.freeze(['disabled','enabled','pin']);
const DESCRIPTORS=Object.freeze([
  {key:'sensor_read',label:'Read sensors',detail:'Sensor and binary_sensor states; no separate approval.',default:'enabled',fixed:true},
  {key:'other_read',label:'Read other devices',detail:'Includes locks, presence, covers, alarms, and other state information.',default:'disabled'},
  {key:'assist',label:'Home Assistant Assist',detail:'Conversation agents can control the home; requires separate Home Assistant restrictions.',default:'disabled'},
  {key:'lights',label:'Lights',detail:'Turn lights on/off and change brightness.',default:'disabled'},
  {key:'switches',label:'Switches',detail:'Switch connected devices on/off.',default:'disabled'},
  {key:'fans',label:'Fans',detail:'Control fans and speed.',default:'disabled'},
  {key:'climate',label:'Thermostats',detail:'Adjust temperature and HVAC mode.',default:'disabled'},
  {key:'scenes',label:'Scenes',detail:'A scene may indirectly trigger sensitive automations.',default:'disabled'},
  {key:'automations',label:'Automations',detail:'Can indirectly control locks, doors or alarms.',default:'disabled'},
  {key:'scripts',label:'Scripts',detail:'Scripts may contain arbitrary Home Assistant actions.',default:'disabled'},
  {key:'covers',label:'Doors, covers and garage',detail:'Opening or closing a cover may open a garage or door.',default:'disabled',recommended:'pin'},
  {key:'locks',label:'Locks',detail:'Lock and unlock operations.',default:'disabled',recommended:'pin'},
  {key:'security',label:'Security systems',detail:'Arm or disarm alarms.',default:'disabled',recommended:'pin'},
  {key:'events',label:'Custom events',detail:'Events can trigger automations with physical effects.',default:'disabled'}
]);
const DEFAULT_POLICY=Object.freeze(Object.fromEntries(DESCRIPTORS.map(d=>[d.key,d.default])));
const GROUP_BY_DOMAIN=Object.freeze({light:'lights',switch:'switches',fan:'fans',climate:'climate',scene:'scenes',automation:'automations',script:'scripts',cover:'covers',lock:'locks',alarm_control_panel:'security'});
function normalizePolicy(input){
  if(input===undefined||input===null||input==='')return {...DEFAULT_POLICY};
  let raw=input;
  if(typeof raw==='string'){
    if(raw.length>8192)throw new TypeError('Permission configuration exceeds 8192 characters');
    try{raw=JSON.parse(raw)}catch{throw new TypeError('Permission configuration must be valid JSON')}
  }
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new TypeError('Permission configuration must be a JSON object');
  const policy={...DEFAULT_POLICY};
  for(const [key,val] of Object.entries(raw)){
    if(!Object.hasOwn(DEFAULT_POLICY,key))throw new TypeError('Unknown permission: '+key);
    if(key==='sensor_read' && val!=='enabled')throw new TypeError('Sensor reading is always enabled in this preview');
    if(!MODES.includes(val))throw new TypeError('Invalid mode for '+key+': expected disabled, enabled, or pin');
    policy[key]=val;
  }
  return policy;
}
function modeFor(policy,key){return policy[key]||'disabled'}
function isSensor(id){return id.startsWith('sensor.')||id.startsWith('binary_sensor.')}
function categoryForDomain(domain){return GROUP_BY_DOMAIN[domain]||null}
module.exports={MODES,DESCRIPTORS,DEFAULT_POLICY,normalizePolicy,modeFor,isSensor,categoryForDomain,GROUP_BY_DOMAIN};
