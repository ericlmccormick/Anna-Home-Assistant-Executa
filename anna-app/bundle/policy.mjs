export const PERMISSIONS = Object.freeze([
  {key:"sensor_read",label:"Sensors and binary sensors",detail:"Read-only sensor values and binary sensors.",fixed:true,default:"enabled"},
  {key:"other_read",label:"Other entity states",detail:"Presence, locks, alarm states, covers and other non-sensor values.",default:"disabled"},
  {key:"assist",label:"Home Assistant conversations",detail:"Assist can trigger device actions internally; restrict its Home Assistant permissions.",default:"disabled"},
  {key:"lights",label:"Lights",detail:"Turn lights on and off, dim.",default:"disabled"},
  {key:"switches",label:"Switches",detail:"Turn connected switches on or off.",default:"disabled"},
  {key:"fans",label:"Fans",detail:"Power and speed.",default:"disabled"},
  {key:"climate",label:"Thermostats",detail:"Temperature and HVAC modes.",default:"disabled"},
  {key:"scenes",label:"Scenes",detail:"Scenes can indirectly control security devices.",default:"disabled"},
  {key:"automations",label:"Automations",detail:"Automations can trigger arbitrary device actions.",default:"disabled"},
  {key:"scripts",label:"Scripts",detail:"Scripts may control security-sensitive devices.",default:"disabled"},
  {key:"covers",label:"Garage doors, doors and covers",detail:"Opening/closing covers can give physical access.",default:"disabled",recommend:"pin"},
  {key:"locks",label:"Door locks",detail:"Lock and unlock.",default:"disabled",recommend:"pin"},
  {key:"security",label:"Security and alarms",detail:"Arm and disarm security systems.",default:"disabled",recommend:"pin"},
  {key:"events",label:"Custom events",detail:"Events may indirectly trigger sensitive automations.",default:"disabled"}
]);
export const DEFAULT=Object.freeze(Object.fromEntries(PERMISSIONS.map(x=>[x.key,x.default])));
const MODES=["disabled","enabled","pin"];
export function normalize(input){
 if(!input || typeof input!=="object" || Array.isArray(input)) return {...DEFAULT};
 const p={...DEFAULT};
 for(const [key,value] of Object.entries(input)){
   if(!Object.hasOwn(DEFAULT,key)) throw new Error("Unknown permission: "+key);
   if(key==="sensor_read" && value!=="enabled") throw new Error("Sensor read must stay enabled");
   if(!MODES.includes(value))throw new Error("Invalid permission mode");
   p[key]=value;
 }
 return p;
}
export function exportPolicy(policy){
 return JSON.stringify(normalize(policy),null,2);
}
