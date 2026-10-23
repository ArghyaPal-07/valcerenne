require('dotenv').config();
const fs=require('fs'),path=require('path');
(async()=>{
 const args=process.argv.slice(2),project=args.includes('--project')?args[args.indexOf('--project')+1]:null;
 if(!project||project!==process.env.FIREBASE_PROJECT_ID)throw new Error('Supply --project matching FIREBASE_PROJECT_ID.');
 if(process.env.FIRESTORE_EMULATOR_HOST)throw new Error('Use the emulator test configuration for emulator rules.');
 if(!args.includes('--write'))return console.log('Dry run: would publish server-only Firestore rules for '+project+'. Add --write to apply.');
 const {firebase}=require('../server/firebase/config'),{getSecurityRules}=require('firebase-admin/security-rules');const {app,db}=firebase();
 try{
  const rules=getSecurityRules(app),current=await rules.getFirestoreRuleset();
  fs.mkdirSync('.firebase',{recursive:true});
  fs.writeFileSync(path.join('.firebase','previous-firestore-rules.json'),JSON.stringify({project,name:current.name,source:current.source},null,2));
  const applied=await rules.releaseFirestoreRulesetFromSource(fs.readFileSync('firestore.rules','utf8'));
  console.log('Published server-only Firestore rules to '+project+'. Previous rules saved in ignored .firebase/ for recovery.');
  console.log('Ruleset: '+applied.name);
 }finally{await db.terminate();}
})().catch(error=>{console.error('Rules deployment failed: '+error.message);process.exitCode=1;});
