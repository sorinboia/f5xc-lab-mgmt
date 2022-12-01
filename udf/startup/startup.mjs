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
      ...udfMetadata,
      awsAz: tfOutput.az.value,
      awsRegion: tfOutput.region.value,
      subnetId: tfOutput.subnet_id.value,
      vpcId: tfOutput.vpc_id.value    
    };
            
    output = (await axios.post(`${f5xcLabMgmtDomain}/v1/student`,dataToPost)).data;
    if (output.code == 6) {
      state = 2;
    } else {
      state = 1;
    }
    
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
    exec(`ssh -o "StrictHostKeyChecking no" -i ~/.ssh/aws.key ubuntu@${tfOutput.microk8s_ip.value} ` +
          '"sudo apt-get update -y && ' +
          'sudo apt-get upgrade -y && ' +
          'sudo snap install microk8s --classic && ' +
          'sudo microk8s.start && ' +          
          'sudo microk8s.enable dns:10.0.0.2 && ' +
          'sudo microk8s.enable ingress &&' +
          'sudo usermod -a -G microk8s ubuntu"');
    exec(`ssh -o "StrictHostKeyChecking no" -i ~/.ssh/aws.key ubuntu@${tfOutput.microk8s_ip.value} "microk8s config" > ~/.kube/config`);
    exec(`sed -i 's/certificate-authority-data.*//g' ~/.kube/config`);
    exec(`sed -i 's/server.*16443/server: https:\\/\\/${tfOutput.microk8s_ip.value}:16443\\n    insecure-skip-tls-verify: true/g' ~/.kube/config`);
    exec('kubectl apply -f /home/ubuntu/lab/udf/aws_microk8s/')

    

    state = 1;
  } catch (e) {
    state = 2;
    error = e.stack || e;
  }

  return {state, output, error};    
}

const generateHugo = async () => {      
  let state = 3, error, output;
  
  try {
    const makeId = db.data.functions.f5xcCreateUserEnv.output.makeId;
    const deployment = db.data.functions.getUdfMetadata.output.metaDeployment.deployment;
    const udfArcadia = _.find(_.find(deployment.components,{name:'MicroK8s'}).accessMethods.https,{label:'Arcadia OnPrem'}).host;
    const ceOnPrem = db.data.functions.f5xcCreateUserEnv.output.createdNames.ceOnPrem.clusterName;
    const acradiaCe = _.find(_.find(deployment.components,{name:'F5XC CE ( On prem )'}).accessMethods.https,{label:'Arcadia CE'}).host;
    const ceOnAws = db.data.functions.f5xcCreateUserEnv.output.createdNames.awsSiteName;
    const namespace = db.data.functions.f5xcCreateUserEnv.output.createdNames.namespace;

    exec('rm -rf /home/ubuntu/lab/udf/startup/hugo && git clone https://github.com/sorinboia/hugo-f5xc-experience.git /home/ubuntu/lab/udf/startup/hugo/');
    
    exec(`find /home/ubuntu/lab/udf/startup/hugo/content/ -type f -exec sed -i -e 's/::udfarcadia::/${udfArcadia}/g' {} \\;`);
    exec(`find /home/ubuntu/lab/udf/startup/hugo/content/ -type f -exec sed -i -e 's/::makeid::/${makeId}/g' {} \\;`);
    exec(`find /home/ubuntu/lab/udf/startup/hugo/content/ -type f -exec sed -i -e 's/::ceOnPrem::/${ceOnPrem}/g' {} \\;`);
    exec(`find /home/ubuntu/lab/udf/startup/hugo/content/ -type f -exec sed -i -e 's/::acradiaCe::/${acradiaCe}/g' {} \\;`);
    exec(`find /home/ubuntu/lab/udf/startup/hugo/content/ -type f -exec sed -i -e 's/::ceOnAws::/${ceOnAws}/g' {} \\;`);
    exec(`find /home/ubuntu/lab/udf/startup/hugo/content/ -type f -exec sed -i -e 's/::namespace::/${namespace}/g' {} \\;`);
    
    exec('cd /home/ubuntu/lab/udf/startup/hugo && hugo -D -d /home/ubuntu/hugo');
    

    state = 1;
  } catch (e) {
    state = 2;
    error = e.stack || e;
  }

  return {state, output, error};    
} 

const awsCeLbRecordUpdate =  () => {      
  
  return new Promise((resolve,reject) => {
    let state = 3, error, output;
    try {
   
    
      const checker = setInterval(() => {
        const cmdResult = exec('aws elbv2 describe-load-balancers | jq -rj .LoadBalancers[0].DNSName').toString();
        logger.info(`cmdResult ${cmdResult}`);
        if (cmdResult != null) {
          exec(`echo "resource \\"aws_route53_record\\" \\"arcadiaonprem\\" {
            zone_id = aws_route53_zone.private.zone_id
            name    = \\"arcadiaonprem.aws.internal\\"
            type    = \\"CNAME\\"
            ttl     = 300
            records = [\\"${cmdResult}\\"]
          }" > /home/ubuntu/lab/udf/terraform/dns_records.tf`);
          exec('terraform -chdir=/home/ubuntu/lab/udf/terraform apply --auto-approve');
          state = 1;
          resolve({state, output, error})
          clearInterval(checker);
        }
      },60000); 
  
      
    } catch (e) {
      state = 2;
      error = e.stack || e;
      reject({state, output, error});
    }
    
  });  
}

const runBot = async () => {      
  let state = 3, error, output;
  
  try {
    const makeid = db.data.functions.f5xcCreateUserEnv.output.makeId;
    
    exec(`docker run -d -e TARGETURL=http://${makeid}.sales-public.f5demos.com/ sorinboiaf5/arcadia-bot:latest`);

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
        key: 'getUdfMetadata'
    },
    terraform: {
      order: 2,
      state: 0,
      key: 'terraform'     
    },
    f5xcCreateUserEnv: {
      order: 3,
      state: 0,
      key: 'f5xcCreateUserEnv'      
    },
    registerOnPremCe: {
      order: 4,
      state: 0,
      key: 'registerOnPremCe'           
    },
    installAwsMicrok8s: {
      order: 5,
      state: 0,
      key: 'installAwsMicrok8s'          
    },
    generateHugo: {
      order: 6,
      state: 0,
      key: 'generateHugo'         
    },
    awsCeLbRecordUpdate: {
      order: 7,
      state: 0,
      key: 'awsCeLbRecordUpdate'          
    },
    runBot: {
      order: 8,
      state: 0,
      key: 'runBot'          
    }       
  }
};

db.data.functions.getUdfMetadata.func = getUdfMetadata;
db.data.functions.terraform.func = terraform;
db.data.functions.f5xcCreateUserEnv.func = f5xcCreateUserEnv;
db.data.functions.registerOnPremCe.func = registerOnPremCe;
db.data.functions.installAwsMicrok8s.func = installAwsMicrok8s;
db.data.functions.generateHugo.func = generateHugo;
db.data.functions.awsCeLbRecordUpdate.func = awsCeLbRecordUpdate;
db.data.functions.runBot.func = runBot;


const f5xcLabMgmtDomain = 'https://f5xclabmgmt.vltr.nginx-experience.com';


const main = async  () => {
  try {
    exec('rm /home/ubuntu/startup/error');
  } catch(e) {
  }
  
    const tasks = _.orderBy(db.data.functions,['order'],['asc']);
    for (let i=0; i < tasks.length; i++) {
      const { func, key, state} = tasks[i];
      if (state != 1) {
        logger.info(`RUNNING ${key}`);
        const result = await func();
        db.data.functions[key].state = result.state;
        db.data.functions[key].output = result.output;
        db.data.functions[key].error = result.error;
        db.write();
        if (result.state != 1 ) {
          exec('touch /home/ubuntu/startup/error')
          break;
        }
      }          
    }
}




main();