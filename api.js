import Fastify from 'fastify';
const fastify = Fastify({
    logger: {
        transport: {
          target: 'pino-pretty',
          options: {            
            ignore: 'pid,hostname,reqId',
            singleLine: true,
            messageFormat: '{reqId} {msg}',
          }
        }
    },


});



import Xcworkshop from './xcworkshop.js';
import Xck8sworkshop from './xck8sworkshop.js';
import Xcapiworkshop from './xcapiworkshop.js';
let f5xcemeaworkshop, f5xcemeak8sworkshop, f5xcemeaapiworkshop;

const args = process.argv.slice(2);
if (args[0]) {    
  f5xcemeaworkshop = new Xcworkshop({domain:args[0],key:args[1], courseId: 'f5xcemeaworkshop'});
  f5xcemeak8sworkshop = new Xck8sworkshop({domain:args[0],key:args[1], courseId: 'f5xcemeak8sworkshop'});
  f5xcemeaapiworkshop = new Xcapiworkshop({domain:args[0],key:args[1], courseId: 'f5xcemeaapiworkshop'});
}



fastify.route({
    method: 'POST',
    url: '/v1/student',
    handler: async (request,reply) => {        
        if (f5xcemeaworkshop) {
          request.log.info(request.body);
          let { courseId, email } = request.body;
          
          if (email.toLowerCase() == 's.boiangiu@f5.com') email = 'sorinboia@gmail.com';
          if (email.toLowerCase() == 'm.dierick@f5.com') email = 'matt262810@gmail.com';        
          if (email.toLowerCase() == 'p.cloup@f5.com') email = 'philippe@pipomolo.com';
          if (email.toLowerCase() == 'p.zoller@f5.com') email = 'patrick.zoller@gmx.de';
          if (email.toLowerCase() == 'a.vistola@f5.com') email = 'alfredo@vistola.de';
          let result;
          switch (courseId) {
            case 'f5xcemeaworkshop':
              result = await f5xcemeaworkshop.newStudent({ ...request.body, email , ip: request.ip, log: request.log });      
              break;
            case 'f5xcemeaapiworkshop':
              result = await f5xcemeaapiworkshop.newStudent({ ...request.body, email, ip: request.ip, log: request.log });    
              break;
            case 'f5xcemeak8sworkshop':
              result = await f5xcemeak8sworkshop.newStudent({ ...request.body, email, ip: request.ip, log: request.log });    
              break;
            default:
              result = {success:'fail',msg:'Unknow courseId'}
          }          
          return result;
        } else {
          request.log.info('No available credentials for F5XC');
          return {success:'fail',msg:'No available credentials for F5XC'}
        }
        
    }
});

fastify.route({
  method: 'GET',
  url: '/v1/student/:courseId/:emailb64',
  handler: async (request,reply) => {        
    
    const email = Buffer.from(request.params.emailb64, 'base64').toString('utf8');
    const courseId = request.params.courseId;
    

    request.log.info(`Getting student data for ${email} courseId ${courseId}`);
    if (f5xcemeaworkshop) {
      let result;
      switch (courseId) {
        case 'f5xcemeaworkshop':
          result = await f5xcemeaworkshop.getStudentDetails({ email });      
          break;

        case 'f5xcemeaapiworkshop':
          result = await f5xcemeaapiworkshop.getStudentDetails({ email });    
          break;          

        case 'f5xcemeak8sworkshop':
          result = await f5xcemeak8sworkshop.getStudentDetails({ email });    
          break;
        
        default:
          result = {success:'fail',msg:'Unknow courseId'}
      }              
      return result;
    } else {
      request.log.info('No available credentials for F5XC');
      return {success:'fail',msg:'No available credentials for F5XC'}
    }
  
  }
});

fastify.route({
  method: 'DELETE',
  url: '/v1/student',
  handler: async (request,reply) => {        
      request.log.info(request.body);
      const result = await c.deleteStudent({ ...request.body, log: request.log });        
      return result;
  }
});


fastify.route({
  method: 'POST',
  url: '/v1/f5xcred',
  handler: async (request,reply) => {              
      request.log.info('Credentials received for F5XC');
      f5xcemeaworkshop = new Xcworkshop({...request.body, courseId: 'f5xcemeaworkshop' });
      f5xcemeak8sworkshop = new Xck8sworkshop({...request.body, courseId: 'f5xcemeak8sworkshop' });      
      f5xcemeaapiworkshop = new Xcapiworkshop({...request.body, courseId: 'f5xcemeaapiworkshop' });      
  }
});

const log = fastify.log;

export default fastify;
export { log }