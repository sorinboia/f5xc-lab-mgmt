import setupAutomation from './setupAutomation.mjs';

const f5xcLabMgmtDomain = 'https://f5xclabmgmt.vltr.nginx-experience.com';

const args = process.argv.slice(2);
const course = args[0];
console.log('Args are',args);


let runSetup;

const main = async () => {
  switch (course) {
    case 'f5xcemeaworkshop':
        runSetup = new setupAutomation ({ 
        courseId: course,
        f5xcLabMgmtDomain,
        steps: [
          'terraform',
          'f5xcCreateUserEnv',
          'registerOnPremCe',
          'installAwsMicrok8s',
          'awsCeLbRecordUpdate',
          'runBot'
        ]
      })
      await runSetup.run();
      break;

    case 'f5xcemeaapiworkshop':
      console.log('API1');
      runSetup = new setupAutomation ({ 
        courseId: course,
        f5xcLabMgmtDomain,
        steps: [          
          'f5xcCreateUserEnv',          
        ]
      })      
      break;

    case 'f5xcemeak8sworkshop':
      runSetup = new setupAutomation ({ 
        courseId: course,
        f5xcLabMgmtDomain,
        steps: [          
          'f5xcCreateUserEnv'
        ]
      })
      await runSetup.run();
      break;

    default:
      console.log('Unknown course')
      break;
  }
}


main();



