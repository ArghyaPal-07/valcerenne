require('dotenv').config();
(async()=>{
 const {firebase,publicConfig}=require('../server/firebase/config');
 publicConfig();const {db,auth,app}=firebase();
 try{if(!process.env.FIRESTORE_EMULATOR_HOST)await app.options.credential.getAccessToken();const outcomes=await Promise.allSettled([db.collection('products').limit(1).get(),auth.listUsers(1)]);for(const outcome of outcomes)if(outcome.status==='rejected')throw outcome.reason;const [products,users]=outcomes.map(outcome=>outcome.value);console.log(JSON.stringify({project:process.env.FIREBASE_PROJECT_ID,firestore:'connected',authentication:'connected',catalogueHasRecords:!products.empty,authHasUsers:users.users.length>0},null,2));}
 finally{await db.terminate();}
})().catch(error=>{console.error('Firebase connection check failed: '+error.message);process.exitCode=1;});
