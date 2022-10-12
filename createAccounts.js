import axios  from 'axios';

const data = {"email": "s.boiangiu@f5.com", "udfHost": "0406f98c-4a62-48ef-9c76-28efad4bddde.access.udf.f5.com", "region": "europe-west2", "awsAccountId": "833786255869", "awsApiKey": "AKIA4EIMITH65USH7HVF", "awsApiSecret": "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", "awsAz": "eu-west-2a", "awsRegion": "eu-west-2", "subnetId": "subnet-0ae63d2468bfe6e26", "vpcId": "vpc-0d3cfbee602fa9faa" }


//const emails = ['sorinboia@gmail.com','sorinboia1@gmail.com','sorinboia2@gmail.com','sorinboia3@gmail.com','sorinboi4@gmail.com'];
const emails = ['sorinboia1@gmail.com']
for (const email of emails) {
    data.email = email;
    axios.post('http://localhost:8080/v1/student',data)
        .then((x) => {
            console.log(email,' created.');
        })
        .catch((err) => {
            console.log(err);
        });
}


/*
const data1 = {"email": "s.boiangiu@f5.com", "udfHost": "fc2990b0-b254-4422-b809-5a116490433b.access.udf.f5.com", "region": "europe-west2", "awsAccountId": "775004371248", "awsApiKey": "AKIA3I4O4HEYB4KARO4N", "awsApiSecret": "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", "awsAz": "eu-west-2a", "awsRegion": "eu-west-2", "subnetId": "subnet-0a83a029b7c0011e2", "vpcId": "vpc-0b33546678125e992" }
const emails1 = ['sorinboia5@gmail.com','sorinboia6@gmail.com','sorinboia7@gmail.com','sorinboia8@gmail.com','sorinboi9@gmail.com'];
for (const email of emails1) {
    data1.email = email;
    axios.post('http://localhost:8080/v1/student',data1)
        .then((x) => {
            console.log(email,' created.');
        })
        .catch((err) => {
            console.log(err);
        });
}
*/
