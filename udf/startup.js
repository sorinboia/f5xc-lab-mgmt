const axios = require('axios');
const execSync = require('child_process').execSync;

const pino = require('pino');
const pretty = require('pino-pretty');
const createSonicBoom = (dest) =>
  pino.destination({ dest: dest, sync: true, append: false, mkdir: true });
const streams = [
  { stream: pretty({
    sync: true,
    ignore: 'pid,hostname',
    crlf: true
  }) },
  { stream: pretty({
    sync: true,
    ignore: 'pid,hostname',
    crlf: true,
    destination: createSonicBoom('./log')
  }) }, 
];
const logger = pino({}, pino.multistream(streams));

const exec = (cmd) => {
    const result = execSync(cmd);    
    logger.info(`CMD: ${cmd} => ${result.toString()}`);
    return result;
}

const makeid = (length) => {
    let result           = '';
    const characters       = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for ( let i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
}

const f5xcLabMgmtDomain = '';



const main = async  () => {
    const metaCloudAccounts = (await axios.get('http://metadata.udf/cloudAccounts')).data;
    const awsAccountId = metaCloudAccounts.cloudAccounts[0].accountId;
    const awsApiKey = metaCloudAccounts.cloudAccounts[0].apiKey;
    const awsApiSecret = metaCloudAccounts.cloudAccounts[0].apiSecret;
    
    const metaDeployment = (await axios.get('http://metadata.udf/deployment')).data;
    const email = metaDeployment.deployment.deployer;
    const udfHost = metaDeployment.deployment.host;
    const region = metaDeployment.deployment.region;
    
    let dataToPost = { email: 'sorinboia@gmail.com', udfHost, region, awsAccountId, awsApiKey, awsApiSecret };

    logger.info(metaCloudAccounts);
    logger.info(metaDeployment);


    exec(`aws configure set aws_access_key_id ${awsApiKey}`);
    exec(`aws configure set aws_secret_access_key ${awsApiSecret}`);
    exec('terraform apply --auto-approve');

    const tfOutput = JSON.parse(exec('terraform output -json'));    
    
    logger.info(tfOutput);
    
    dataToPost = { ...dataToPost, 
        awsAz: tfOutput.az.value,
        awsRegion: tfOutput.region.value,
        subnetId: tfOutput.subnet_id.value,
        vpcId: tfOutput.vpc_id.value
    }
    
    logger.info(dataToPost);

    
    
}




main();