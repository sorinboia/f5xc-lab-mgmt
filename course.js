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
    const makeId = makeid(6);
    const lowerEmail = email.toLowerCase();
    const randomPart = (new Date()).toISOString().split('T')[0].replace(/-/g,'') + '-' + makeId;
    const id = lowerEmail.replace(/[^a-zA-Z0-9]/g, "").split("@")[0] + '-' + randomPart;
    const namespace = 'ns-' + id;
    const ccName = 'cc-' + id;
    const awsSiteName = 'as-' + id;
    const ceOnPrem = {
        clusterName: 'ceop-' + id,
        hostname: 'ceophost' + id
    }
    
    return { lowerEmail, namespace, ccName, awsSiteName, makeId, ceOnPrem};
}


class Course {
    constructor({domain,key}) {
        this.f5xc = new F5xc(domain,key);
        this.db = new LowSync(new JSONFileSync('./db/db.json'));
        this.db.read();
        this.db.data = this.db.data || { students: {} };
        this.log = {};
        this.periodicChecks();                
    }

    async newStudent({ email, udfHost, ip, region, awsAccountId, awsApiKey, awsApiSecret, awsRegion, awsAz, vpcId, subnetId, log }) {
        if (email == 's.boiangiu@f5.com') email = 'sorinboia@gmail.com';
        this.log[email] = log;        
        const createdNames = createNames(email);
        const { lowerEmail, namespace, ccName, awsSiteName, makeId, ceOnPrem } = createdNames;
        
        
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
                await this.f5xc.createAwsVpcSite({makeId, name: awsSiteName, namespace, cloudCredentials: ccName, awsRegion, awsAz, vpcId, subnetId }).catch((e) =>  {                     
                    log.warn({operation:'createAwsVpcSite',...e}); 
                    err = {operation:'createAwsVpcSite',...e};                
                });
            }
            

            if (!err) {
                this.db.data.students[email] = { email, state:'active',makeId, createdNames, udfHost, ip, region, awsAccountId, awsApiKey, awsApiSecret, awsRegion, awsAz, vpcId, subnetId, f5xcTf: { awsVpcSite:'APPLYING'}, ceRegistration: {state:'NONE', ...ceOnPrem } ,failedChecks: 0, log };

                this.db.write();
                log.info('Student created');
                return this.db.data.students[email];
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

    async deleteStudent({ email, createdNames, log }) {
        let studentCreatedNames;
        if (email) studentCreatedNames = this.db.data.students[email].createdNames; 

        const { lowerEmail, namespace, ccName, awsSiteName, ceOnPrem} =  studentCreatedNames || createdNames;

        
       
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

        await this.f5xc.deleteSite({name:ceOnPrem.clusterName }).catch((e) =>  { 
            log.warn({operation:'deleteSite',...e});             
        });
                
        if (this.db.data.students[email]) {
            log.info(email + ' is being deleted');
            setTimeout(() => {
                delete this.db.data.students[email];
                this.db.write();
                log.info(email + ' was deleted');  
            }, 240000);
        }        
    }

    periodicChecks() {
        this.deleteInactiveStudents();
        this.checkF5xcTf();
        this.checkCeReg();
    }

    checkCeReg() {
        setInterval(async (x) => {
            for (const [email,student] of Object.entries(this.db.data.students)) {                
                const log = this.log[email] || fastifyLog;
                
                const { state, clusterName } = student.ceRegistration;
                                
                if (state !== 'APPROVED') {                    
                    const siteData = await this.f5xc.listRegistrationsBySite({name: clusterName});
                    if (siteData.items[0]) {
                        const regName = siteData.items[0].name;
                        const regPassport = siteData.items[0].object.spec.gc_spec.passport;
                        const approvalState = await this.f5xc.registrationApprove({name:regName, passport:regPassport })
                        log.info('CE on prem Approved');                    
                        this.db.data.students[email].ceRegistration.name = regName;
                        this.db.data.students[email].ceRegistration.state = 'APPROVED';
                        this.db.write();
                    }
                    
                }                                                                
            }
        },10000);
    }

    checkF5xcTf() {
        // Will need to do some refactoring on this later
        setInterval(async (x) => {
            for (const [email,student] of Object.entries(this.db.data.students)) {                
                const log = this.log[email] || fastifyLog;
                const { f5xcTf, state } = student;
                const { awsSiteName } = student.createdNames;
                console.log('a',email,state,awsSiteName);
                if (student.f5xcTf.awsVpcSite !== 'APPLIED' || state == 'deleting') {
                    const res = await this.f5xc.getAwsVpcSite({name: awsSiteName}).catch((e) =>  { 
                        log.warn({operation:'getAwsVpcSite',...e});             
                    });                                
                    if (!res) return;
                    const  {apply_state, error_output } = res.status.apply_status;
                
                    if (apply_state) {
                        console.log('applied state',apply_state)
                        this.db.data.students[email].f5xcTf.awsVpcSite = apply_state;
                    }
                    this.db.write();
                    
                    console.log('1',email, apply_state, error_output);
                    if (error_output) {
                        log.info(`${email} TF issue . Error ${error_output}`);
                        if (error_output.indexOf('PendingVerification') > -1 ) await this.f5xc.awsVpcSiteTF({name: awsSiteName, action: 'APPLY'});       
                        
                        console.log('2',error_output.indexOf('InvalidClientToken'),state);
                        
                        if (error_output.indexOf('InvalidClientToken') > -1  && state == 'deleting') {
                            console.log('Trying to delete');
                            await this.f5xc.deleteAwsVpcSite({name: awsSiteName});       

                        }
                        

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
                    if ( this.db.data.students[email].failedChecks >= 5 && this.db.data.students[email].state != 'deleting') {
                        this.db.data.students[email].state = 'deleting';
                        this.deleteStudent({ email, log }).catch((e) =>  { 
                            log.warn({operation:'deleteInactiveStudents',...e});                             
                        });
                        
                                              
                    }                    
                });                
            }
        },20000);
    }
}


export default Course;