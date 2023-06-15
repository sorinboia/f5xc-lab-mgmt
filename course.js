import { LowSync, JSONFileSync } from 'lowdb';
import F5xc from './f5xc.js';
import dns from 'node:dns';
import axios from 'axios';
import https from 'https';
import { log as fastifyLog } from './api.js'
import crypto from 'crypto';




const validateStudent = async ({udfHost,ip}) => {
    let success;    
    const options = {
        family: 4,
        hints: dns.ADDRCONFIG | dns.V4MAPPED,
    };
    const result = await dns.promises.lookup(udfHost, options);
    
    return true || result.address == ip; 
}

const generateHash = (arr) => {
    let hash = crypto.createHash('md5');    
    hash.update(arr.join(''));    
    return hash.digest('hex');
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


const createNames = (email) => {
    const makeId = makeid(8);
    const lowerEmail = email.toLowerCase();
    const randomPart = (new Date()).toISOString().split('T')[0].replace(/-/g,'').slice(4) + '-' + makeId;
    const id = randomPart;
    const namespace = 'ns-' + id;
    const ccName = 'cc-' + id;
    const awsSiteName = 'as-' + id;
    const ceOnPrem = {
        clusterName: 'ceop-' + id,
        hostname: 'ceophost' + id
    }
    const vk8sName = 'vk8s-' + id;
    
    return { lowerEmail, namespace, ccName, awsSiteName, makeId, ceOnPrem, vk8sName};
}

const queue = [];

setInterval(()=> {
    const data = queue.shift();
    if (data) {
        const { f5xc ,log , lowerEmail, makeId, name, namespace, cloudCredentials, awsRegion, awsAz, vpcId, subnetId } = data;
        log.info(lowerEmail + ' creating site AWS VPC site')
        f5xc.createAwsVpcSite({makeId, name, namespace, cloudCredentials, awsRegion, awsAz, vpcId, subnetId }).catch((e) =>  {                     
            log.warn({email:lowerEmail,operation:'createAwsVpcSite',...e}); 
        });
    }
},60000);



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
        const createdNames = createNames(email);
        const { lowerEmail, ccName, awsSiteName, makeId, ceOnPrem, vk8sName } = createdNames;
        let namespace;
        const hash = generateHash([lowerEmail,makeId]);
        this.log[hash] = log;
        let userExisted = 'no';
        
        let err;

        const studentValidity = await validateStudent({udfHost,ip}).catch((e) => log.warn({operation:'validateStudent',e})).catch((e) => {         
            log.warn({operation:'studentValidity',...e}); 
        });
        
        
        
        if (studentValidity) {
            /*
            await this.f5xc.createNS(namespace).catch((e) =>  { 
                log.warn({operation:'createNS',...e}); 
                err = {operation:'createNS',...e};                
            });
            
            if (!err) await this.f5xc.createUser(lowerEmail,namespace).catch(async (e) => {                 
                if (e.message.indexOf('user with email already exist') > -1) {
                    userExisted = 'yes';                    
                    await this.f5xc.assignNs(email,namespace).catch((e) =>  {                         
                        log.warn({operation:'assignNs',...e}); 
                        err = {operation:'assignNs',...e};                
                    });

                } else {
                    log.warn({operation:'createUser',...e});
                    err = {operation:'createUser',...e};   
                }
                
            });            
            */

            
            await (new Promise(async (resolve,reject) => {
                let userCheckRep = 0;
                const userCheck = setInterval(async ()=> {                                
                    userCheckRep++;                    
                    if (userCheckRep <= 10) {
                        console.log(userCheckRep);                                ;
                        const users = await this.f5xc.getUsersNs();
                        
                        users.items.forEach(element => {
                            if (element.email == email) {
                                element.namespace_roles.forEach((item) => {
                                    if (item.role == 'ves-io-power-developer-role') {                                        
                                        namespace = item.namespace;                                        
                                        clearInterval(userCheck);
                                        resolve();

                                    }
                                })
                            }                                                
                        });
    
    
                    } else {
                        log.warn({operation:'getUsersNs',error:`Could not find user ${email}`}); 
                        err = {operation:'getUsersNs',error:`Could not find user ${email}`};   
                        
                        clearInterval(userCheck);
                        reject();
                    }                
                },5000);
            })); 
                                            
            if (!err) {
                await this.f5xc.createCloudCredentials({name: ccName, namespace, awsApiKey, awsApiSecret }).catch((e) =>  {                     
                    log.warn({operation:'createCloudCredentials',...e}); 
                    err = {operation:'createCloudCredentials',...e};                
                });
            }

            if (!err) {
                queue.push({f5xc:this.f5xc ,log , lowerEmail,makeId, name: awsSiteName, namespace, cloudCredentials: ccName, awsRegion, awsAz, vpcId, subnetId });
                /* await this.f5xc.createAwsVpcSite({makeId, name: awsSiteName, namespace, cloudCredentials: ccName, awsRegion, awsAz, vpcId, subnetId }).catch((e) =>  {                     
                    log.warn({operation:'createAwsVpcSite',...e}); 
                    err = {operation:'createAwsVpcSite',...e};                
                }); */
            }

            
            if (!err) {
                await this.f5xc.createvK8s( { name: vk8sName, namespace }).catch((e) =>  {                     
                    log.warn({operation:'createvK8s',...e}); 
                    err = {operation:'createvK8s',...e};                
                });
            }

            if (!err) {
                this.db.data.students[hash] = { email, userExisted, state:'active',makeId, createdNames, udfHost, ip, region, awsAccountId, awsApiKey, awsApiSecret, awsRegion, awsAz, vpcId, subnetId, f5xcTf: { awsVpcSite:'APPLYING'}, ceRegistration: {state:'NONE', ...ceOnPrem } ,failedChecks: 0, log };

                this.db.write();
                log.info('Student created');
                return this.db.data.students[hash];
            } else {
                log.warn('Student creation failed');
                                
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

    async deleteStudent({ hash, createdNames, log }) {
        let studentCreatedNames;
        if (hash) studentCreatedNames = this.db.data.students[hash].createdNames; 

        const { lowerEmail, namespace, ccName, awsSiteName, ceOnPrem, makeId} =  studentCreatedNames || createdNames;
        hash = hash || generateHash([lowerEmail, makeId]);
        const userExisted = this.db.data.students[hash].userExisted;
        
       
        await this.f5xc.deleteAwsVpcSite({ name:awsSiteName }).catch((e) =>  { 
            log.warn({operation:'deleteAwsVpcSite',...e});             
        });

        await this.f5xc.deleteCloudCredentials({ name:ccName }).catch((e) =>  { 
            log.warn({operation:'deleteCloudCredentials',...e});             
        });

        /*
        if (userExisted == 'yes') {
            log.warn('User existed, not deleting');
        } else {
            await this.f5xc.deleteUser(lowerEmail).catch((e) =>  { 
                log.warn({operation:'deleteUser',...e});             
            });
        }

        await this.f5xc.deleteNS(namespace).catch((e) =>  { 
            log.warn({operation:'deleteNS',...e});             
        });
        */

        await this.f5xc.deleteSite({name:ceOnPrem.clusterName }).catch((e) =>  { 
            log.warn({operation:'deleteSite',...e});             
        });
                
        if (this.db.data.students[hash]) {
            log.info(`${lowerEmail} with ${makeId} is being deleted`);
            setTimeout(() => {
                delete this.db.data.students[hash];
                this.db.write();
                log.info(lowerEmail + ' was deleted');  
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
            for (const [hash,student] of Object.entries(this.db.data.students)) {                
                const log = this.log[hash] || fastifyLog;
                
                const { state, clusterName } = student.ceRegistration;
                                
                if (state !== 'APPROVED') {                    
                    const siteData = await this.f5xc.listRegistrationsBySite({name: clusterName});
                    if (siteData.items[0]) {
                        const regName = siteData.items[0].name;
                        const regPassport = siteData.items[0].object.spec.gc_spec.passport;
                        const approvalState = await this.f5xc.registrationApprove({name:regName, passport:regPassport })
                        log.info('CE on prem Approved');                    
                        this.db.data.students[hash].ceRegistration.name = regName;
                        this.db.data.students[hash].ceRegistration.state = 'APPROVED';
                        this.db.write();
                    }
                    
                }                                                                
            }
        },30000);
    }

    checkF5xcTf() {
        // Will need to do some refactoring on this later
        setInterval(async (x) => {
            for (const [hash,student] of Object.entries(this.db.data.students)) {                
                const log = this.log[hash] || fastifyLog;
                const { f5xcTf, state,email } = student;
                const { awsSiteName } = student.createdNames;
                
                if (student.f5xcTf.awsVpcSite !== 'APPLIED' || state == 'deleting') {
                    const res = await this.f5xc.getAwsVpcSite({name: awsSiteName}).catch((e) =>  { 
                        if (state != 'deleting') log.warn({operation:'getAwsVpcSite',...e});             
                    });                                
                    
                    if (!res) return;
                    
                    const  {apply_state, error_output } = res.status.apply_status || {apply_state:null, error_output: null  };
                
                    if (apply_state) {                        
                        this.db.data.students[hash].f5xcTf.awsVpcSite = apply_state;
                        this.db.write();
                    }
                                                            
                    if (error_output) {
                        log.info(`${email} TF issue . Error ${error_output}`);
                        if (error_output.indexOf('PendingVerification') > -1 ) await this.f5xc.awsVpcSiteTF({name: awsSiteName, action: 'APPLY'});    
                        if (error_output.indexOf('failed to apply') > -1 ) await this.f5xc.awsVpcSiteTF({name: awsSiteName, action: 'APPLY'});                            
                        if (error_output.indexOf('InvalidClientToken') > -1  && state == 'deleting') {                            
                            await this.f5xc.deleteAwsVpcSite({name: awsSiteName});       
                        }                        
                    }   
                }                                                            
            }
        },30000);
    }

    deleteInactiveStudents() {                                    
        setInterval((x) => {
            for (const [hash,student] of Object.entries(this.db.data.students)) {                
                const log = this.log[hash] || fastifyLog;
                const { udfHost } = student;
                
                axios.head(`https://${udfHost}`,{ validateStatus:  status  => status == 401, timeout: 2000,httpsAgent: new https.Agent({  
                    rejectUnauthorized: false
                  }) })
                  .then(() => {
                    this.db.data.students[hash].failedChecks = 0;
                  })
                  .catch((e) => {                    
                    this.db.data.students[hash].failedChecks++;
                    if ( this.db.data.students[hash].failedChecks >= 5 && this.db.data.students[hash].state != 'deleting') {
                        this.db.data.students[hash].state = 'deleting';
                        this.deleteStudent({ hash, log }).catch((e) =>  { 
                            log.warn({operation:'deleteInactiveStudents',...e});                             
                        });
                        
                                              
                    }                    
                });                
            }
        },20000);
    }
}


export default Course;