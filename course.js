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

const createNames = (email) => {
    const lowerEmail = email.toLowerCase();
    const id = lowerEmail.replace(/[^a-zA-Z0-9]/g, "") + 2;
    const namespace = 'ns' + id;
    const ccName = 'cc' + id;
    const awsSiteName = 'as' + id;

    return { lowerEmail, namespace, ccName, awsSiteName};
}


class Course {
    constructor({domain,key}) {
        this.f5xc = new F5xc(domain,key);
        this.db = new LowSync(new JSONFileSync('db.json'));
        this.db.read();
        this.db.data = this.db.data || { students: {} };
        this.log = {};
        this.deleteInactiveStudents();                
    }

    async newStudent({ email, udfHost, ip, region, awsAccountId, awsApiKey, awsApiSecret, awsRegion, awsAz, vpcId, subnetId, log }) {
        this.log[email] = log;        
        const { lowerEmail, namespace, ccName, awsSiteName} = createNames(email);
        
        
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
                this.db.data.students[email] = { email, udfHost, ip, region, awsAccountId, awsApiKey, awsApiSecret, awsRegion, awsAz, vpcId, subnetId, failedChecks: 0, log };
                this.db.write();
                log.info('Student created');
            } else {
                log.warn('Student creation failed, reverting config');
                
                await this.deleteStudent({email, log})

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

    async deleteStudent({ email, log }) {
        
        const { lowerEmail, namespace, ccName, awsSiteName} = createNames(email);        
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
                        delete this.db.data.students[email];
                        this.deleteStudent({ email, log }).catch((e) =>  { 
                            log.warn({operation:'deleteInactiveStudents',...e});                             
                        });;                        
                        this.db.write();
                        log.info(email + ' was deleted');                        
                    }                    
                });                
            }
        },5000);
    }
}


export default Course;