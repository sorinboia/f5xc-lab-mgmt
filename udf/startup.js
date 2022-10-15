process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

//const f5xcLabMgmtDomain = 'https://f5xclabmgmt.vltr.nginx-experience.com';

const f5xcLabMgmtDomain = 'http://46.117.182.180:52345';

const onPremCeIp = '10.1.1.7:65500';


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
    
    const createdUserData = (await axios.post(`${f5xcLabMgmtDomain}/v1/student`,dataToPost)).data;

    logger.info(createdUserData);
    
    const onPremCePostData = {
        token: '18db4163-9f4f-438a-b922-c617ae7ac4ed',
        cluster_name: createdUserData.createdNames.ceOnPrem.clusterName,
        hostname: createdUserData.createdNames.ceOnPrem.hostname,
        latitude: '32.06440042393975',
        longitude: '34.894059728328465',
        certified_hardware: 'kvm-voltmesh',
        primary_outside_nic: 'eth0'
    }
    const onPremCeRegData = (await axios.post(`https://${onPremCeIp}/api/ves.io.vpm/introspect/write/ves.io.vpm.config/update`, onPremCePostData,{
        headers: {
            Authorization: 'Basic YWRtaW46Vm9sdGVycmExMjM='
        }
    })).data;

    logger.info(`onPremCeRegData ${JSON.stringify(onPremCeRegData)}`)

    //await delay(60000);
    exec(`ssh -o "StrictHostKeyChecking no" -i ~/.ssh/aws.key ubuntu@${tfOutput.microk8s_ip.value} "microk8s config" > ~/.kube/config`);

}




main();