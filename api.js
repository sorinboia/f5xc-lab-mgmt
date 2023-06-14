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



import Course from './course.js';
let c;

const args = process.argv.slice(2);
if (args[0]) {    
  c = new Course({domain:args[0],key:args[1]});
}



fastify.route({
    method: 'POST',
    url: '/v1/student',
    handler: async (request,reply) => {        
        if (c) {
          request.log.info(request.body);
          const result = await c.newStudent({ ...request.body, ip: request.ip, log: request.log });        
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
      c = new Course(request.body);
      
  }
});

const log = fastify.log;

export default fastify;
export { log }