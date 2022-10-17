process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import axios from 'axios';
import { execSync } from 'child_process';
import _ from 'lodash';
import pino from 'pino';
import pretty from 'pino-pretty';

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


const getUdfMetadata = async () => {
    let state = 3, error, output;
    try {
      const metaCloudAccounts = (await axios.get('http://metadata.udf/cloudAccounts')).data;
      db.data.udfMetadata.awsAccountId = metaCloudAccounts.cloudAccounts[0].accountId;
      db.data.udfMetadata.awsApiKey = metaCloudAccounts.cloudAccounts[0].apiKey;
      db.data.udfMetadata.awsApiSecret = metaCloudAccounts.cloudAccounts[0].apiSecret;
      
      const metaDeployment = (await axios.get('http://metadata.udf/deployment')).data;
      db.data.udfMetadata.email = metaDeployment.deployment.deployer;
      db.data.udfMetadata.udfHost = metaDeployment.deployment.host;
      db.data.udfMetadata.region = metaDeployment.deployment.region;
      output = { metaCloudAccounts, metaDeployment }
      state = 1;
      db.write();
    } catch (e) {
      state = 2;
      error = e.stack || e;
    }

    return {state, output, error};    
}

const terraform = async () => {      
  let state = 3, error, output;
  try {
    exec(`aws configure set aws_access_key_id ${db.data.udfMetadata.awsApiKey}`);
    exec(`aws configure set aws_secret_access_key ${db.data.udfMetadata.awsApiSecret}`);
    exec('terraform -chdir=/home/ubuntu/lab/udf/terraform init');
    exec('terraform -chdir=/home/ubuntu/lab/udf/terraform apply --auto-approve');
    exec('terraform -chdir=/home/ubuntu/lab/udf/terraform apply --auto-approve');
    output = JSON.parse(exec('terraform -chdir=/home/ubuntu/lab/udf/terraform output -json'));    
    state = 1;
    db.write();
  } catch (e) {    
    state = 2;
    error = e.stack || e;
  }

  return {state, output, error};    
}

const f5xcCreateUserEnv = async () => {      
  let state = 3, error, output;
  try {
    const udfMetadata = db.data.udfMetadata;
    const tfOutput = db.data.functions.terraform.output;
    const dataToPost = { 
      email: 'sorinboia@gmail.com', 
      ...udfMetadata,
      awsAz: tfOutput.az.value,
      awsRegion: tfOutput.region.value,
      subnetId: tfOutput.subnet_id.value,
      vpcId: tfOutput.vpc_id.value    
    };
            
    output = (await axios.post(`${f5xcLabMgmtDomain}/v1/student`,dataToPost)).data;
    state = 1;
  } catch (e) {
    state = 2;
    error = e.stack || e;
  }

  return {state, output, error};    
}

const registerOnPremCe = async () => {      
  let state = 3, error, output;
  try {
    const ip = '10.1.1.7:65500';
    const createdUserData = db.data.functions.f5xcCreateUserEnv.output;    
    const onPremCePostData = {
      token: '18db4163-9f4f-438a-b922-c617ae7ac4ed',
      cluster_name: createdUserData.createdNames.ceOnPrem.clusterName,
      hostname: createdUserData.createdNames.ceOnPrem.hostname,
      latitude: '32.06440042393975',
      longitude: '34.894059728328465',
      certified_hardware: 'kvm-voltmesh',
      primary_outside_nic: 'eth0'
    }
    const onPremCeRegData = (await axios.post(`https://${ip}/api/ves.io.vpm/introspect/write/ves.io.vpm.config/update`, onPremCePostData,{
      headers: {
          Authorization: 'Basic YWRtaW46Vm9sdGVycmExMjM='
      }
    })).data;

    state = 1;
  } catch (e) {
    state = 2;
    error = e.stack || e;
  }

  return {state, output, error};    
}

const installAwsMicrok8s = async () => {      
  let state = 3, error, output;
  
  try {
    const tfOutput = db.data.functions.terraform.output;
    exec('ssh -o "StrictHostKeyChecking no" -i ~/.ssh/aws.key ubuntu@${tfOutput.microk8s_ip.value} "\
          sudo apt-get update -y && \
          sudo apt-get upgrade -y && \
          snap install microk8s --classic && \
          microk8s.start && \
          microk8s.enable dns ingress && \
          usermod -a -G microk8s ubuntu"');
    exec(`ssh -o "StrictHostKeyChecking no" -i ~/.ssh/aws.key ubuntu@${tfOutput.microk8s_ip.value} "microk8s config" > ~/.kube/config`);
    exec(`sed -i 's/certificate-authority-data.*//g' ~/.kube/config`);
    exec(`sed -i 's/server.*16443/server: https:\/\/${tfOutput.microk8s_ip.value}:16443\\n    insecure-skip-tls-verify: true/g' ~/.kube/config`);
    exec('kubectl apply -f aws_microk8s/*')

    state = 1;
  } catch (e) {
    state = 2;
    error = e.stack || e;
  }

  return {state, output, error};    
}

import { LowSync, JSONFileSync } from 'lowdb';
const db = new LowSync(new JSONFileSync('./db.json'));
db.read();
db.data = db.data || { 
  udfMetadata: {},
  dataToPostF5xcmgmt: {}, 
  functions: { 
    getUdfMetadata: {
        order: 1,
        state: 0,
        key: 'getUdfMetadata',
        func: getUdfMetadata        
    },
    terraform: {
      order: 2,
      state: 0,
      key: 'terraform',
      func: terraform        
    },
    f5xcCreateUserEnv: {
      order: 3,
      state: 0,
      key: 'f5xcCreateUserEnv',
      func: f5xcCreateUserEnv        
    },
    registerOnPremCe: {
      order: 4,
      state: 0,
      key: 'registerOnPremCe',
      func: registerOnPremCe             
    },
    installAwsMicrok8s: {
      order: 5,
      state: 0,
      key: 'installAwsMicrok8s',
      func: installAwsMicrok8s             
    } 
  }
};

db.data.functions.getUdfMetadata.func = getUdfMetadata;
db.data.functions.terraform.func = terraform;
db.data.functions.f5xcCreateUserEnv.func = f5xcCreateUserEnv;
db.data.functions.registerOnPremCe.func = registerOnPremCe;
db.data.functions.installAwsMicrok8s.func = installAwsMicrok8s;


const f5xcLabMgmtDomain = 'https://f5xclabmgmt.vltr.nginx-experience.com';
//const f5xcLabMgmtDomain = 'http://46.117.182.180:52345';

const onPremCeIp = '';

const main = async  () => {

    const tasks = _.orderBy(db.data.functions,['order'],['asc']);
    for (let i=0; i < tasks.length; i++) {
      const { func, key, state} = tasks[i];
      if (state != 1) {
        const result = await func();
        db.data.functions[key].state = result.state;
        db.data.functions[key].output = result.output;
        db.data.functions[key].error = result.error;
        db.write();
        if (result.state != 1 ) break;
      }          
    }
    

    




}




main();