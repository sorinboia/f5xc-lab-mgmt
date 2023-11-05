process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import axios from 'axios';
import { execSync } from 'child_process';
import _ from 'lodash';
import { LowSync, JSONFileSync } from 'lowdb';
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

class setupAutomation {
    constructor({ courseId, steps, f5xcLabMgmtDomain }) {
        this.f5xcLabMgmtDomain = f5xcLabMgmtDomain;
        this.steps = steps;
        this.db = new LowSync(new JSONFileSync('./db.json'));
        this.db.read();
        this.courseId = courseId
        this.db.data = this.db.data || {
            courseId,
            udfMetadata: {},
            dataToPostF5xcmgmt: {}, 
            functions: {
                getUdfMetadata: {
                    order: 1,
                    state: 0,
                    key: 'getUdfMetadata'
                },
                ... steps.reduce((obj, key, idx) => (obj[key] = { order: idx + 2, state: 0, key }, obj), {})
            }
        }
    }

    async run() {
        try {
            exec('rm /home/ubuntu/startup/error');
        } catch(e) {
        }

        const tasks = _.orderBy(this.db.data.functions,['order'],['asc']);
        for (let i=0; i < tasks.length; i++) {
            const { func, key, state} = tasks[i];
            if (state != 1) {
                logger.info(`RUNNING ${key}`);
                const result = await this[key]();
                this.db.data.functions[key].state = result.state;
                this.db.data.functions[key].output = result.output;
                this.db.data.functions[key].error = result.error;
                this.db.write();
                if (result.state != 1 ) {
                    exec('touch /home/ubuntu/startup/error')
                    break;
                }
            }          
        }
    }

    async getUdfMetadata() {
       let state = 3, error, output;
       try {            
          const metaCloudAccounts = (await axios.get('http://metadata.udf/cloudAccounts')).data;
          this.db.data.udfMetadata.awsAccountId = metaCloudAccounts.cloudAccounts[0].accountId;
          this.db.data.udfMetadata.awsApiKey = metaCloudAccounts.cloudAccounts[0].apiKey;
          this.db.data.udfMetadata.awsApiSecret = metaCloudAccounts.cloudAccounts[0].apiSecret;
          
          const metaDeployment = (await axios.get('http://metadata.udf/deployment')).data;
          this.db.data.udfMetadata.email = metaDeployment.deployment.deployer;
          this.db.data.udfMetadata.udfHost = metaDeployment.deployment.host;
          this.db.data.udfMetadata.region = metaDeployment.deployment.region;
          
          this.db.data.udfMetadata.hostArcadia = _.find(_.find(metaDeployment.deployment.components,{name:'MicroK8s'}).accessMethods.https,{label:'Arcadia OnPrem'}).host;
          this.db.data.udfMetadata.ceArcadia = _.find(_.find(metaDeployment.deployment.components,{name:'F5XC CE ( On prem )'}).accessMethods.https,{label:'Arcadia CE'}).host;
          
          
          output = { metaCloudAccounts, metaDeployment }
          state = 1;
          this.db.write();
        } catch (e) {
          state = 2;
          error = e.stack || e;
        }
    
        return {state, output, error};    

    }

    async terraform() {      
        let state = 3, error, output;
        try {
          exec(`aws configure set aws_access_key_id ${this.db.data.udfMetadata.awsApiKey}`);
          exec(`aws configure set aws_secret_access_key ${this.db.data.udfMetadata.awsApiSecret}`);
          
          exec('terraform -chdir=/home/ubuntu/lab/udf/terraform init');
          exec('terraform -chdir=/home/ubuntu/lab/udf/terraform apply --auto-approve');
          exec('terraform -chdir=/home/ubuntu/lab/udf/terraform apply --auto-approve');
          output = JSON.parse(exec('terraform -chdir=/home/ubuntu/lab/udf/terraform output -json'));    
          state = 1;
          this.db.write();
        } catch (e) {    
          state = 2;
          error = e.stack || e;
        }

        return {state, output, error};    
    }

    async f5xcCreateUserEnv() {      
        let state = 3, error, output;
        try {
          const udfMetadata = this.db.data.udfMetadata;
          const tfOutput = this.db.data.functions.terraform.output;
          const dataToPost = { 
            courseId: this.courseId,
            ...udfMetadata,
            awsAz: tfOutput.az.value,
            awsRegion: tfOutput.region.value,
            subnetId: tfOutput.subnet_id.value,
            vpcId: tfOutput.vpc_id.value    
          };
      
          output = (await axios.post(`${this.f5xcLabMgmtDomain}/v1/student`,dataToPost)).data;
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

    async registerOnPremCe() {      
        let state = 3, error, output;
        try {
          const ip = '10.1.1.5:65500';
          const createdUserData = this.db.data.functions.f5xcCreateUserEnv.output;    
          
          const onPremCePostData = {
            token: '771e948b-f6ef-4338-9b50-953762f7a2a7',
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

    async installAwsMicrok8s() {      
        let state = 3, error, output;
        
        try {
          const tfOutput = this.db.data.functions.terraform.output;
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

    async awsCeLbRecordUpdate() {      
  
        return new Promise((resolve,reject) => {
          let state = 3, error, output;
          try {
         
          
            const checker = setInterval(() => {
              const cmdResult = exec('aws elbv2 describe-load-balancers --region eu-west-2 | jq -rj .LoadBalancers[0].DNSName').toString();
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

    async runBot() {      
        let state = 3, error, output;
        
        try {
          const makeid = this.db.data.functions.f5xcCreateUserEnv.output.makeId;
          
          exec(`docker run -d -e TARGETURL=http://arcadia-re-${makeid}.workshop.emea.f5se.com/ sorinboiaf5/arcadia-bot:latest`);
         
      
          state = 1;
        } catch (e) {
          state = 2;
          error = e.stack || e;
        }
      
        return {state, output, error};    
    } 
}

export default setupAutomation;