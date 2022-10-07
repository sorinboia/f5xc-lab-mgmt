import { LowSync, JSONFileSync } from 'lowdb';
import F5xc from './f5xc.js';
import dns from 'node:dns';
import axios from 'axios';
import https from 'https';
import { log as fastifyLog } from './api.js'




const validateStudent = async ({udfHost,ip}) => {
    let success;    
    const options = {
        family: 4,
        hints: dns.ADDRCONFIG | dns.V4MAPPED,
    };
    const result = await dns.promises.lookup(udfHost, options);
    
    return true || result.address == ip; 
}



const makeid = (length) => {
    let result           = '';
    const characters       = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for ( let i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * 
 charactersLength));
   }
   return result;
}


const createNames = (email) => {
    const lowerEmail = email.toLowerCase();
    const randomPart = (new Date()).toISOString().split('T')[0].replace(/-/g,'') + '-' + makeid(6);
    const id = lowerEmail.replace(/[^a-zA-Z0-9]/g, "").split("@")[0] + '-' + randomPart;
    const namespace = 'ns-' + id;
    const ccName = 'cc-' + id;
    const awsSiteName = 'as-' + id;
    
    return { lowerEmail, namespace, ccName, awsSiteName};
}


class Course {
    constructor({domain,key}) {
        this.f5xc = new F5xc(domain,key);
        this.db = new LowSync(new JSONFileSync('db.json'));
        this.db.read();
        this.db.data = this.db.data || { students: {} };
        this.log = {};
        this.periodicChecks();                
    }

    async newStudent({ email, udfHost, ip, region, awsAccountId, awsApiKey, awsApiSecret, awsRegion, awsAz, vpcId, subnetId, log }) {
        this.log[email] = log;        
        const createdNames = createNames(email);
        const { lowerEmail, namespace, ccName, awsSiteName} = createdNames;
        
        
        let err;

        const studentValidity = await validateStudent({udfHost,ip}).catch((e) => log.warn({operation:'validateStudent',e})).catch((e) => {         
            log.warn({operation:'studentValidity',...e}); 
        });
        
        
        
        if (studentValidity) {
            await this.f5xc.createNS(namespace).catch((e) =>  { 
                log.warn({operation:'createNS',...e}); 
                err = {operation:'createNS',...e};                
            });
            
            if (!err) await this.f5xc.createUser(lowerEmail,namespace).catch((e) => { 
                log.warn({operation:'createUser',...e});
                err = {operation:'createUser',...e};   
            });            
            
                        
            if (!err) {
                await this.f5xc.createCloudCredentials({name: ccName, namespace, awsApiKey, awsApiSecret }).catch((e) =>  {                     
                    log.warn({operation:'createCloudCredentials',...e}); 
                    err = {operation:'createCloudCredentials',...e};                
                });
            }

            if (!err) {
                await this.f5xc.createAwsVpcSite({name: awsSiteName, namespace, cloudCredentials: ccName, awsRegion, awsAz, vpcId, subnetId }).catch((e) =>  {                     
                    log.warn({operation:'createAwsVpcSite',...e}); 
                    err = {operation:'createAwsVpcSite',...e};                
                });
            }
            

            if (!err) {
                this.db.data.students[email] = { email, createdNames, udfHost, ip, region, awsAccountId, awsApiKey, awsApiSecret, awsRegion, awsAz, vpcId, subnetId, f5xcTf: { awsVpcSite:'APPLYING'}, failedChecks: 0, log };

                this.db.write();
                log.info('Student created');
            } else {
                log.warn('Student creation failed, reverting config');
                
                await this.deleteStudent({createdNames, log})

                return err;
            }
                    
        } else {
            log.warn('Student creation failed');
            return {
                status: 'error',
                msg: 'Validity failed'
            }
        }
        
    }

    async deleteStudent({ createdNames, log }) {
        
        const { lowerEmail, namespace, ccName, awsSiteName} = createdNames;        
        await this.f5xc.deleteAwsVpcSite({ name:awsSiteName }).catch((e) =>  { 
            log.warn({operation:'deleteAwsVpcSite',...e});             
        });

        await this.f5xc.deleteCloudCredentials({ name:ccName }).catch((e) =>  { 
            log.warn({operation:'deleteCloudCredentials',...e});             
        });

        await this.f5xc.deleteUser(lowerEmail).catch((e) =>  { 
            log.warn({operation:'deleteUser',...e});             
        });
        await this.f5xc.deleteNS(namespace).catch((e) =>  { 
            log.warn({operation:'deleteNS',...e});             
        });
                

    }

    periodicChecks() {
        this.deleteInactiveStudents();
        this.checkF5xcTf()       ;
    }

    checkF5xcTf() {
        setInterval(async (x) => {
            for (const [email,student] of Object.entries(this.db.data.students)) {                
                const log = this.log[email] || fastifyLog;
                const { f5xcTf } = student;
                const { awsSiteName } = student.createdNames;
                                
                if (student.f5xcTf.awsVpcSite !== 'APPLIED') {
                    const res = await this.f5xc.getAwsVpcSite({name: awsSiteName});
                                
                    const  {apply_state, error_output  } = res.status.apply_status;

                    const error = res.status.apply_status.error_output

                    this.db.data.students[email].f5xcTf.awsVpcSite = apply_state;
                    this.db.write();
                    
                    
                    if (error_output) {
                        log.info(`${email} TF issue Re-Applying TF. Error ${error_output}`);
                        if (error_output.indexOf('PendingVerification' > -1 )) await this.f5xc.awsVpcSiteTF({name: awsSiteName, action: 'APPLY'})
                        
                    }   
                }
                
                
                
                
            }
        },30000);
    }

    deleteInactiveStudents() {                                    
        setInterval((x) => {
            for (const [email,student] of Object.entries(this.db.data.students)) {                
                const log = this.log[email] || fastifyLog;
                const { udfHost } = student;
                
                axios.head(`https://${udfHost}`,{ validateStatus:  status  => status == 401, timeout: 2000,httpsAgent: new https.Agent({  
                    rejectUnauthorized: false
                  }) }).catch((e) => {
                    
                    this.db.data.students[email].failedChecks++;
                    if ( this.db.data.students[email].failedChecks >= 3) {
                        
                        this.deleteStudent({ createdNames: this.db.data.students[email].createdNames, log }).catch((e) =>  { 
                            log.warn({operation:'deleteInactiveStudents',...e});                             
                        });
                        delete this.db.data.students[email];
                        this.db.write();
                        log.info(email + ' was deleted');                        
                    }                    
                });                
            }
        },5000);
    }
}


export default Course;