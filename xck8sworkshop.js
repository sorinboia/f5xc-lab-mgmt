import Course from './course.js';


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


class Xck8sworkshop extends Course {
    constructor({domain,key,courseId}) {
        super({domain,key,courseId});        
    }

    async newStudent({ email, hostArcadia, ceArcadia, udfHost, ip, region, awsAccountId, awsApiKey, awsApiSecret, awsRegion, awsAz, vpcId, subnetId, log }) {
        
        const initNewStudent = await super.newStudent({ email, hostArcadia, ceArcadia, udfHost, ip, region, awsAccountId, awsApiKey, awsApiSecret, awsRegion, awsAz, vpcId, subnetId, log });        
        let err;

        if (initNewStudent.status == 'error') {
            err = initNewStudent;
        }
        
        const { hash, namespace, lowerEmail, ccName, awsSiteName, makeId, ceOnPrem, vk8sName, createdNames } = initNewStudent;

        if (!err) {
            await this.f5xc.updateUserForK8s({ email ,nsName: namespace }).catch((e) =>  {                     
                log.warn({operation:'updateUserForK8s',...e}); 
                err = {operation:'updateUserForK8s',...e};                
            });
        }

        if (!err) {
            
            this.db.data.students[hash] = { email, hostArcadia, ceArcadia, state:'active',makeId, createdNames, udfHost, ip, region, awsAccountId, awsApiKey, awsApiSecret, awsRegion, awsAz, vpcId, subnetId, f5xcTf: { awsVpcSite:'APPLYING'}, ceRegistration: {state:'NONE', ...ceOnPrem } ,failedChecks: 0, log };

            this.db.write();
            log.info('Student created');
            return this.db.data.students[hash];
        } else {
            log.warn('Student creation failed');
                            
            return err;
        }

    }

    async deleteStudent({ hash, createdNames, log }) {
        let studentCreatedNames;
        if (hash) studentCreatedNames = this.db.data.students[hash].createdNames; 

        const { lowerEmail,  makeId} =  studentCreatedNames || createdNames;
        hash = hash || generateHash([lowerEmail]);
                       

                
        if (this.db.data.students[hash]) {
            log.info(`${lowerEmail} with ${makeId} is being deleted`);
            setTimeout(() => {
                delete this.db.data.students[hash];
                this.db.write();
                log.info(lowerEmail + ' was deleted');  
            }, 240000);
        }        
    }

    

}

export default Xck8sworkshop;