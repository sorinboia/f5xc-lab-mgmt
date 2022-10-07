import axios from 'axios';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
class F5xc {
    constructor(domain,key) {
        this.axios = axios.create({
            baseURL: `https://${domain}` ,
            headers: {
                'Authorization': `APIToken ${key}`,
                'Content-Type': 'application/json'
            }
        });
    
        this.axios.interceptors.request.use(function (config) {            
            //console.log(config);
            return config;
            }, function (error) {            
                return Promise.reject(error.request);
            });
                
        this.axios.interceptors.response.use(function (response) {            
                return response;
            }, function (error) {                   
                return Promise.reject({ status: error.response.status, statusText: error.response.statusText, ...error.response.data });
        });    
    }

    async createNS(nsName) {
        const endPoint = '/api/web/namespaces';
        const data = {
            'metadata':
                {
                    'annotations': {},
                    'description': '',
                    'disable': false,
                    'labels': {},
                    'name': nsName,
                    'namespace': ''
                },
            'spec': {}
        }
        await this.axios.post(endPoint,data);
    }

    async deleteNS(nsName) {
        const endPoint = `/api/web/namespaces/${nsName}/cascade_delete`;

        const data = {
            "name": nsName
        }
        
        await this.axios.post(endPoint,data);
    }

    async createUser(email,nsName) {
        const endPoint = '/api/web/custom/namespaces/system/user_roles';
        const data = {
            'email': email.toLowerCase(),
            'first_name': 'lab',
            'last_name': 'user',
            'name': email.toLowerCase(),
            'idm_type': 'VOLTERRA_MANAGED',
            'namespace': 'system',
            'namespace_roles': [
                {
                    'namespace': nsName, 
                    'role': 'ves-io-admin-role'
                }
                
            ],
            'type': 'USER'
        }

        await this.axios.post(endPoint,data);
    }

    async deleteUser(email) {
        const endPoint = '/api/web/custom/namespaces/system/users/cascade_delete';
        const data = {
            "email": email.toLowerCase(),
            "namespace": "system"
        }
        await this.axios.post(endPoint,data);
    }

    async createCloudCredentials ({name, awsApiKey, awsApiSecret}) {
        const endPoint = `/api/config/namespaces/system/cloud_credentialss`
        const data = {
            'metadata':{
                'annotations': {},
                'description': '',
                'disable': false,
                'labels': {},
                'name': name,
                'namespace': 'system'
            },
            'spec': {
                'aws_secret_key': {
                    'access_key': awsApiKey,
                    'secret_key': {
                        'clear_secret_info': {
                            'url': `string:///${Buffer.from(awsApiSecret).toString('base64')}`
                        }
                    }
                }
            }
        }
        
        await this.axios.post(endPoint,data);
    }

    async deleteCloudCredentials ({name}) {
        const endPoint = `/api/config/namespaces/system/cloud_credentialss/${name}`
        const data = {            
            name,
            namespace: 'system'
          }

        await this.axios.delete(endPoint,data);
    }
    
    async createAwsVpcSite ({name, namespace, cloudCredentials, awsRegion, awsAz, vpcId, subnetId}) {        
        const endPoint = `/api/config/namespaces/system/aws_vpc_sites`
        const data = {
            'metadata':{
                'annotations': {},
                'description': '',
                'disable': false,
                'labels': {},
                'name': name,
                'namespace': 'system'
            },
            'spec': {
                aws_cred: {
                    name: cloudCredentials,
                    namespace: 'system',
                    //tenant: 'f5-sales-public-qdpwiibg'
                    
                },
                aws_region: awsRegion,
                vpc: {
                    vpc_id: vpcId
                },
                ingress_gw: {
                    az_nodes: [
                        {
                            aws_az_name: awsAz,
                            local_subnet: {
                                existing_subnet_id: subnetId
                            },                        
                        }
                    ],
                    aws_certified_hw: "aws-byol-voltmesh",
                    "allowed_vip_port": {
                      "use_http_https_port": {}
                    }
                  },
                instance_type: 't3.xlarge'
            }
        }
        
        await this.axios.post(endPoint,data);


        
        // This does tf apply. We wait 5 sec, sometimes the tf paramters are not available        
        await delay(5000);
        await this.awsVpcSiteTF({name,action: 'APPLY'});
    }

    async awsVpcSiteTF({name,action}) {
        await this.axios.post(`/api/terraform/namespaces/system/terraform/aws_vpc_site/${name}/run`,{ action });        
    }

    async deleteAwsVpcSite ({name}) {        
        const endPoint = `/api/config/namespaces/system/aws_vpc_sites/${name}`
                
        await this.axios.delete(endPoint);
    }

    async getAwsVpcSite({name}) {
       
        const endPoint = `/api/config/namespaces/system/terraform_parameters/aws_vpc_site/${name}/status`        
        const { data } = await this.axios.get(endPoint);
        return data; 
    }
}


export default F5xc;