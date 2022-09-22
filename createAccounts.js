import axios  from 'axios';

const data = {"email": "sorinboia@gmail.com", "udfHost": "e5cb212c-7107-4a0b-976a-5a12e51f2960.access.udf.f5.com", "region": "europe-west2", "awsAccountId": "913686844721", "awsApiKey": "AKIA5JO722UY2NQZVOPY", "awsApiSecret": "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", "awsAz": "eu-west-2a", "awsRegion": "eu-west-2", "subnetId": "subnet-09e53a6cf15615021", "vpcId": "vpc-01adb56567a411652" };


const emails = ['sorinboia@gmail.com','sorinboia1@gmail.com','sorinboia2@gmail.com','sorinboia3@gmail.com','sorinboi4a@gmail.com'];
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

