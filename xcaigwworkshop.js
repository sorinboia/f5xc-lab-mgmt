import Course from './course.js';




class Xcaisecurity extends Course {
    constructor({domain,key,courseId}) {
        super({domain,key,courseId});        
    }

    async newStudent({ email, ollama, hostArcadia, ceArcadia, udfHost, ip, region, awsAccountId, awsApiKey, awsApiSecret, awsRegion, awsAz, vpcId, subnetId, log }) {
        
        const initNewStudent = await super.newStudent({ email, hostArcadia, ceArcadia, udfHost, ip, region, awsAccountId, awsApiKey, awsApiSecret, awsRegion, awsAz, vpcId, subnetId, log });        
        let err;

        if (initNewStudent.status == 'error') {
            err = initNewStudent;
        }
        
        const { hash, namespace, kubeconfig, lowerEmail, ccName, awsSiteName, makeId, ceOnPrem, vk8sName, createdNames } = initNewStudent;

        //if (!err) {
        //    await this.f5xc.updateUserForK8s({ email ,nsName: namespace }).catch((e) =>  {                     
        //        log.warn({operation:'updateUserForK8s',...e}); 
        //        err = {operation:'updateUserForK8s',...e};                
        //    });
        //}

        if (!err) {
            
            this.db.data.students[hash] = { email, ollama, hostArcadia, ceArcadia, kubeconfig, state:'active',makeId, createdNames, udfHost, ip, region, awsAccountId, awsApiKey, awsApiSecret, awsRegion, awsAz, vpcId, subnetId, f5xcTf: { awsVpcSite:'APPLYING'}, ceRegistration: {state:'NONE', ...ceOnPrem } ,failedChecks: 0, log };

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

        const { lowerEmail,  makeId, ceOnPrem, kubeconfig, cek8s} =  studentCreatedNames || createdNames;
        hash = hash || generateHash([lowerEmail]);

        log.info(`${lowerEmail} with ${makeId} is being deleted`);
        

                
        if (this.db.data.students[hash]) {            
            setTimeout(() => {
                delete this.db.data.students[hash];
                this.db.write();
                log.info(lowerEmail + ' was deleted');  
            }, 240000);
        }        
    }

    

}

export default Xcaisecurity;