import setupAutomation from './setupAutomation.mjs';

const f5xcLabMgmtDomain = 'https://f5xclabmgmt.vltr.nginx-experience.com';

const args = process.argv.slice(2);
const course = args[0];



const main = async () => {
  switch (course) {
    case 'f5xcemeaworkshop':
      const runSetup = new setupAutomation ({ 
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
    case 'f5xcemeaapi':
      break;
    case 'f5xcemeak8s':
      break;
    default:
      console.log('Unknow course')
      break;
  }
}


main();



