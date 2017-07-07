process.env.GOPATH = __dirname

var hfc = require('hfc');
var util = require('util');
var fs = require('fs');
var mongo = require('mongodb');
const https = require('https');
var config;
console.log(__dirname);
try {
    config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));
} catch (err) {
    console.log(err);
    console.log("config.json is missing or invalid file, Rerun the program with right file")
    process.exit();
}

// Create a client blockchin.
var chain = hfc.newChain(config.chainName);

// This list of suites is used by GRPC to establish secure connections.  GRPC is the protocol used by the SDK
// to connect to the fabric.
process.env['GRPC_SSL_CIPHER_SUITES'] = 'ECDHE-RSA-AES128-GCM-SHA256:' +
    'ECDHE-RSA-AES128-SHA256:' +
    'ECDHE-RSA-AES256-SHA384:' +
    'ECDHE-RSA-AES256-GCM-SHA384:' +
    'ECDHE-ECDSA-AES128-GCM-SHA256:' +
    'ECDHE-ECDSA-AES128-SHA256:' +
    'ECDHE-ECDSA-AES256-SHA384:' +
    'ECDHE-ECDSA-AES256-GCM-SHA384';

var certPath = __dirname + "/src/" + config.deployRequest.chaincodePath + "/certificate.pem";

// Read and process the credentials.json
var network;
try {
    network = JSON.parse(fs.readFileSync(__dirname + '/ServiceCredentials.json', 'utf8'));
    if (network.credentials) network = network.credentials;
} catch (err) {
    console.log("ServiceCredentials.json is missing or invalid file, Rerun the program with right file")
    process.exit();
}

var global_testChaincodeID;
var global_User;
var patient_name;
var patient_Block_name;
var view_details;
var peers = network.peers;
var users = network.users;

// Determining if we are running on a startup or HSBN network based on the url
// of the discovery host name.  The HSBN will contain the string zone.
var isHSBN = peers[0].discovery_host.indexOf('zone') >= 0 ? true : false;
var network_id = Object.keys(network.ca);
var ca_url = "grpcs://" + network.ca[network_id].discovery_host + ":" + network.ca[network_id].discovery_port;

// Configure the KeyValStore which is used to store sensitive keys.
// This data needs to be located or accessible any time the users enrollmentID
// perform any functions on the blockchain.  The users are not usable without
// This data.
var uuid = network_id[0].substring(0, 8);
chain.setKeyValStore(hfc.newFileKeyValStore(__dirname + '/keyValStore-' + uuid));
var certFile = 'us.blockchain.ibm.com.cert';


init()
function init() {
    if (isHSBN) {
        certFile = 'zone.blockchain.ibm.com.cert';
    }
    fs.createReadStream(certFile).pipe(fs.createWriteStream(certPath));

    enrollAndRegisterUsers();
}

function enrollAndRegisterUsers() {
    var cert = fs.readFileSync(certFile);

    chain.setMemberServicesUrl(ca_url, {
        pem: cert
    });

    // Adding all the peers to blockchain
    // this adds high availability for the client
    for (var i = 0; i < peers.length; i++) {

        // Peers on Bluemix require secured connections, hence 'grpcs://'
        chain.addPeer("grpcs://" + peers[i].discovery_host + ":" + peers[i].discovery_port, {
            pem: cert
        });
    }

    console.log("\n\n------------- peers and caserver information: -------------");
    console.log(chain.getPeers());
    console.log(chain.getMemberServices());
    console.log('-----------------------------------------------------------\n\n');

    // Enroll a 'admin' who is already registered because it is
    // listed in fabric/membersrvc/membersrvc.yaml with it's one time password.
    chain.enroll(users[0].enrollId, users[0].enrollSecret, function (err, admin) {
        if (err) throw Error("\nERROR: failed to enroll admin : " + err);

        console.log("\nEnrolled admin sucecssfully");

        // Set this user as the chain's registrar which is authorized to register other users.
        chain.setRegistrar(admin);

        var enrollName = config.user.username; //creating a new user
        var registrationRequest = {
            enrollmentID: enrollName,
            account: config.user.account,
            affiliation: config.user.affiliation
        };
        chain.registerAndEnroll(registrationRequest, function (err, user) {
            if (err) throw Error(" Failed to register and enroll " + enrollName + ": " + err);

            console.log("\nEnrolled and registered " + enrollName + " successfully");

            //setting timers for fabric waits
            chain.setDeployWaitTime(config.deployWaitTime);
            console.log("\nDeploying chaincode ...");
            deployChaincode(user);
        });
    });
}

//.................................................login n registration part.......................................

function enrollAndRegisterNewUsers(username,role) {
    return new Promise(function(resolve,reject){    
    // Enroll a 'admin' who is already registered because it is
    // listed in fabric/membersrvc/membersrvc.yaml with it's one time password.
        //creating a new user
        chain.enroll(users[0].enrollId, users[0].enrollSecret, function(err, admin)
     {

             if(!err)
        {
                console.log("Admin Enrolled");
                chain.setRegistrar(admin);
                var registrationRequest = {
                    enrollmentID: username,
                    affiliation: "group1",
                    roles:[role]
                };
                console.log("Reg req:",registrationRequest);
                chain.registerAndEnroll(registrationRequest, function(err, user) {
            console.log("err : "+err);
            if (err) return resolve({body:"Can not enroll this user"});
            var certificate=user.enrollment.cert;
            console.log("\nEnrolled and registered " +certificate + " successfully");
//--------------------------------------------------------------------------
            if(role == "provider")
            {
                var r = "name";
                //var p= "prname";           
                var query = {};
                query[r]=user.name
               // query[p]=pname;
                console.log(query);
                var db = new mongo.Db('test', new mongo.Server('localhost', 27017, {}), {});
                db.open(function(err, client)
                {
                    client.createCollection("certInfo1", function(err, col) 
                    {
                        client.collection("certInfo1", function(err, col)
                            {
                                //--------insert query--------------
                                    col.insert(query, function(){});
                                                                

                            });
                    });
                });

            }

//----------------------------------------------------------------------------------
            return resolve({body:"registred"});
        });
    }
    else{
        return resolve({body:"admin is not registred"})
    }
    });
})
}

function deployChaincode(user) {
    var args = getArgs(config.deployRequest);
    // Construct the deploy request
    var deployRequest = {
        // Function to trigger
        fcn: config.deployRequest.functionName,
        // Arguments to the initializing function
        args: args,
        chaincodePath: config.deployRequest.chaincodePath,
        // the location where the startup and HSBN store the certificates
        certificatePath: isHSBN ? config.hsbn_cert_path : config.x86_cert_path
    };
    //console.log("Deploy request: ", deployRequest);
    // Trigger the deploy transaction
    var deployTx = user.deploy(deployRequest);
    //console.log("deployTx: ",deployTx);
    // Print the deploy results
    deployTx.on('complete', function (results) {
        // Deploy request completed successfully
        testChaincodeID = results.chaincodeID;
        //console.log("\nChaincode ID : " + testChaincodeID);
        console.log(util.format("\nSuccessfully deployed chaincode: request=%j, response=%j", deployRequest, results));
        //invokeOnUser(user);
        global_testChaincodeID = testChaincodeID;
        global_User = user;
    });

    deployTx.on('error', function (err) {
        // Deploy request failed
        console.log(util.format("\nFailed to deploy chaincode: request=%j, error=%j", deployRequest, err));
    });
}

function invokeOnUser(user, details) {
    //console.log("Hello")
    var args = getArgs(config.invokeRequest);
    // Construct the invoke request
    var invokeRequest = {
        // Name (hash) required for invoke
        chaincodeID: global_testChaincodeID,
        // Function to trigger
        fcn: config.invokeRequest.functionName,
        // Parameters for the invoke function
        args: args
    };
    //invokeRequest.args = details;
    // Trigger the invoke transaction
    //console.log(invokeRequest.args)
    //var invoke_details = invokeRequest;
    //var response = require('./expressform.js');
    // var u = response;
    invokeRequest.args[0] = details.patient_name;
    invokeRequest.args[1] = details.patient_dob;
    invokeRequest.args[2] = details.problem_desc;
    invokeRequest.args[3] = details.patient_allergy;
    //invokeRequest.args[3] ='USER_'+uname;
    //console.log(invokeRequest.args)
    var invoke_details = invokeRequest;
    console.log("Inside invoke",invoke_details);
    var invokeTx = user.invoke(invoke_details);

    // Print the invoke results
    invokeTx.on('submitted', function (results) {
        // Invoke transaction submitted successfully
        console.log(util.format("\nSuccessfully submitted chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
    });
    invokeTx.on('complete', function (results) {
        // Invoke transaction completed successfully
        console.log(util.format("\nSuccessfully completed chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
        console.log("calling pres function")
        //invokeOnUser2(user);//hard coded josh value
        //invokeOnUser3(user);

        //queryUser(user);
    });
    invokeTx.on('error', function (err) {
        // Invoke transaction submission failed
        console.log(util.format("\nFailed to submit chaincode invoke transaction: request=%j, error=%j", invokeRequest, err));
    });
}


function invokeOnUser2(user, pres_details) {
    var args = getArgs(config.invokeRequest2);

    // Construct the invoke request
    var invokeRequest = {
        // Name (hash) required for invoke
        chaincodeID: global_testChaincodeID,
        // Function to trigger
        fcn: config.invokeRequest2.functionName,
        // Parameters for the invoke function
        args: args
    };


    invokeRequest.args[0] = pres_details.name;
    invokeRequest.args[1] = pres_details.disease;
    invokeRequest.args[2] = pres_details.medication;
    invokeRequest.args[3] = pres_details.duration;
    //console.log(invokeRequest)
    // Trigger the invoke transaction
    var invokeTx = user.invoke(invokeRequest);

    // Print the invoke results
    invokeTx.on('submitted', function (results) {
        // Invoke transaction submitted successfully
        console.log(util.format("\nSuccessfully submitted chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
    });
    invokeTx.on('complete', function (results) {
        // Invoke transaction completed successfully
        console.log(util.format("\nSuccessfully completed chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
        console.log("calling lab function")
        //queryUser(user);
        //queryUser(user);
    });
    invokeTx.on('error', function (err) {
        // Invoke transaction submission failed
        console.log(util.format("\nFailed to submit chaincode invoke transaction: request=%j, error=%j", invokeRequest, err));
    });
}

function invokeOnUser3(user, lab_details,template) {


    return new Promise(function(resolve,reject){
    var args = getArgs(config.invokeRequest3);


    // Construct the invoke request
    var invokeRequest = {
        // Name (hash) required for invoke
        chaincodeID: global_testChaincodeID,
        // Function to trigger
        fcn: config.invokeRequest3.functionName,
        // Parameters for the invoke function
        args: args
    };

    // Trigger the invoke transaction
    // var lab_details = invokeRequest;
    // var response = require('./expressform');
    // var u = response.response1;
    invokeRequest.args[0] = lab_details.u_name;
    invokeRequest.args[1] = lab_details.lab_name;
    invokeRequest.args[2] = lab_details.report_type;
    invokeRequest.args[3] = lab_details.r_date;
    invokeRequest.args[4] = lab_details.impression;
    invokeRequest.args[5] = lab_details.findings;

    patient_name = invokeRequest.args[0];

    //console.log(invokeRequest)
    var invokeTx = user.invoke(invokeRequest);    
    // Print the invoke results
    invokeTx.on('submitted', function (results) {
        // Invoke transaction submitted successfully
        console.log(util.format("\nSuccessfully submitted chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
    });
    invokeTx.on('complete', function (results) {
        // Invoke transaction completed successfully
        console.log(util.format("\nSuccessfully completed chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
        console.log("calling write function")
        
        queryUser(user, patient_name,template).then(function(data){
            return resolve({body:results});
        });
        

    });
    invokeTx.on('error', function (err) {
        // Invoke transaction submission failed
        console.log(util.format("\nFailed to submit chaincode invoke transaction: request=%j, error=%j", invokeRequest, err));
        return resolve({body:"false"});
    });


});






}

function queryUser(user, patient_name) {

    return new Promise(function(resolve,reject){

        
        var args = getArgs(config.queryRequest);
        // Construct the query request
        //console.log(args.length)
        var queryRequest = {
            // Name (hash) required for query
            chaincodeID: testChaincodeID,
            // Function to trigger
            fcn: config.queryRequest.functionName,
            // Existing state variable to retrieve
            args: args
        };
        queryRequest.args[0] = patient_name;
        // Trigger the query transaction
        var queryTx = user.query(queryRequest);
        //console.log(queryTx);
        // Print the query results
        queryTx.on('complete', function (results) {
            // Query completed successfully
           view_details = results.result;
           //console.log("Inside query:",view_details);
           
            console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest, results.result.toString());
            //console.log("prescription_details:",view_details);

            //console.log(view_details)
           
            return resolve({body:results.result});


            
        });
        queryTx.on('error', function (err) {
            // Query failed
            console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest, err);
            return resolve({body:err});
        });
    });
}

function getArgs(request) {
    var args = [];
    for (var i = 0; i < request.args.length; i++) {
        args.push(request.args[i]);
    }
    return args;
}

//.................................................@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@.......................................
var express = require('express');
var path = require('path');
var app = express();



app.use('/public' ,express.static(__dirname+'/public'));
app.use(express.static('public'));
var ejs =require('ejs');

app.set('view engine','ejs');
app.set('views',__dirname+'/views')

app.get('/index.html', function (req, res) {
    res.sendFile(__dirname + "/" + "index.html");
});


//----------------------------------@@@@@@@@@@@@@@@@@@................login n reg part.....................@@@@@@@@@@@@
app.get('/login1.html',function(req,res){
   
    res.sendFile(__dirname+'login1.html');//public removed
    
})


var patient_arr=[];
app.get('/checkUser',function(req,res)  //login
{
    var flag=0;
    
    var username=req.query.name;
    var role = req.query.role;
    console.log("UNmae ",username);
    patient_Block_name = username;
    chain.getUser(req.query.name,function(err,user)
    {
    
            var network_id = Object.keys(network.ca);   //checks if user is present in KeyValStore
            var uuid = network_id[0].substring(0, 8);
            console.log("UID ",uuid);
            var path=__dirname + '/keyValStore-' + uuid;
            fs.readdir(path, function(err, items) 
            {
                    console.log("Inside readdir");
                  for (var i=0; i<items.length; i++) 
                  {
                      var arr=items[i].split(".");
                      if(arr[1] == username)
                         {
                                //console.log("login successful");
                                flag=1;
                         }
                     
                  }
                  if(flag==1)
                  {
                        console.log("login successful");
                         //enrollAndRegisterUsers();
                        if(role == 'patient'){

                        res.redirect('home.html');
                        }
                        else{
                            get_patient_list(username).then(function(data){
                                console.log(username);
                                console.log("data: "+patient_arr);
                            res.render('providerview',{'patientArr':patient_arr});

                            });
                            
                           // res.render('personalviewejs', {'user': view_details,'med_provider':arr});

                            //res.redirect('medicalP.html');
                        }

                  }
                  else
                  {
                         console.log("login not successful");
                         res.redirect("login_again.html");

                  }
             })

           
    })
});

    

    //})
//})


app.get('/userReg',function(req,res){//registration

    var username=req.query.name;
    var role=req.query.role;

    var flag=0;

    var username=req.query.name;
    chain.getUser(req.query.name,function(err,user)
    {
    
         var network_id = Object.keys(network.ca);
            var uuid = network_id[0].substring(0, 8);
            var path=__dirname + '/keyValStore-' + uuid;
            fs.readdir(path, function(err, items)  //checks if user is present in KeyValStore
            {
                  for (var i=0; i<items.length; i++) 
                  {
                      var arr=items[i].split(".");
                      if(arr[1] == username)
                      {
                            flag=1;
                      }
                     
                  }
                  if(flag==1)
                  {
                        // var name = "user already registered";
                        console.log("User already registred");
                        // res.render({name: name });
                        res.write("User already registred");

                  }
                  else
                  {
                        //enrollAndRegisterUsers();//admin enrollment
                         if(role == 'patient'){
                        enrollAndRegisterNewUsers(username,role).then(function(response){//this will create a file in KeyValStore 
                        res.redirect('generalD.html')
                        res.json(response.body);
                        })
                        }
                       else{
                        enrollAndRegisterNewUsers(username,role).then(function(response){
                        res.redirect('login1.html');
                    })
                       }
                    }
                       
                  
                  
             })          
    })

    

})
//...................................@@@@@@@@@@@@@@@@@@@@@@@@@@@@........................................




//var calldatfile = require('./helloblockchain.js');
app.get('/generalD.html', function (req, res) {
    res.sendFile(__dirname + "/" + "generalD.html");
});

app.get('/process_get', function (req, res) {
    // Prepare output in JSON format
    response = {
        patient_name: req.query.name,
        patient_dob: req.query.dob,
        problem_desc: req.query.probdesc,
        patient_allergy: req.query.allergies,
    };
    console.log(response);
    invokeOnUser(global_User, response);
    res.redirect('login1.html')

})

app.get('/formP.html', function (req, res) {
    res.sendFile(__dirname + "/" + "formP.html");
});


app.get('/prescription_details', function (req, res) {

    // Prepare output in JSON format
    console.log("Inside/prescription_details");

    pres_response = {
        name: req.query.name,

        disease: req.query.disease,

        medication: req.query.medication,

        duration: req.query.duration,

    };
    console.log(pres_response);
    invokeOnUser2(global_User, pres_response);
    res.redirect('formP.html')

});


app.get('/lab_details', function (req, res) {
    console.log("Inside/prescription_details");
    // Prepare output in JSON format
    lab_response = {
        u_name: req.query.u_name,

        lab_name: req.query.lab_name,

        report_type: req.query.report_type,

        r_date: req.query.r_date,

        impression: req.query.impression,

        findings: req.query.findings

    };
//------------------------------------------------------------------------------------------------------
var arr;
var db = new mongo.Db('test', new mongo.Server('localhost', 27017, {}), {});
                                          
                                          db.open(function(err, client)
                                          {
                                          //--------------------------certInfo1------------<<-----data stored 
                                                    client.createCollection("certInfo1", function(err, col) 
                                                    {
                                                            client.collection("certInfo1", function(err, col)
                                                            {
                                                        
                                                                // -------------Read query---------------
                                                                 col.find().toArray(function(err,doc)
                                                                 {
                                                                   
                                                                     if(!err)
                                                                     {
                                                                        arr=doc;
                                                                         //console.log(doc);
                                                                       // var arr1 =  doc[1].name;
                                                                        console.log(arr);
                                                                      }
                                                                 });
                                                                                         
                                                            });
                                                    });
                                           });
//-------------------------------------------------------------------------------------------------------
    invokeOnUser3(global_User, lab_response).then(function(data){
        console.log("invokeOnUser3 is done")
        // console.log("1:",view_details);
        // console.log("1:",arr);

            res.render('personalviewejs', {'user': view_details,'med_provider':arr});
        })
     //   res.redirect('lab_details.html')
     //console.log("--------prescription_details:",view_details);
    // patient_details =JSON.stringify(view_details);
    //  res.render('home',{"user":patient_details});
    //res.render('home', {'user': JSON.stringify(view_details)});
    
});
app.get('/med_provider', function (req, res) {

    // Prepare output in JSON format
    console.log("Inside/med_provider");

    med_provider_det = {
        provider_name: req.query.provider,

        patient_name: req.query.privatekey,

     };
    var r = "name";
    var p= "prname";
    var query = {};
    console.log(med_provider_det.patient_name);
    query[p]=med_provider_det.provider_name;
    query[r]=med_provider_det.patient_name;
    var db = new mongo.Db('test', new mongo.Server('localhost', 27017, {}), {});
                                          
    db.open(function(err, client)
                                          {
                                          //--------------------------certInfo1------------<<-----data stored 
                                                    client.createCollection("certInfo4", function(err, col) 
                                                    {
                                                            client.collection("certInfo4", function(err, col)
                                                            {
    
                                 //--------insert query--------------
                                                                col.insert(query, function(){});              
                                                            });
                                                    });
                                           });


    // console.log(pres_response);
    // invokeOnUser2(global_User, pres_response);
    // res.redirect('formP.html')

});

app.get('/med_view', function (req, res) {


    // Prepare output in JSON format
    console.log("inside med view function");

    // patient_response = {
    //      name: req.query.patientName
    //  };
    //console.log(patient_response);
    queryUser(global_User, req.query.patientName).then(function(data){
        console.log("helloabc");
         res.render('providerviewejs', {'user': view_details});
         //res.redirect('formP.html')

    });
    //res.redirect('formP.html')

});


app.get('/BlockView.html', function (req, res) {
    res.sendFile(__dirname + "/" + "BlockView.html");
});
app.get('/ViewBlocks',function(req,res){
    console.log("Name block:",patient_Block_name);
    queryUser(global_User, patient_Block_name).then(function(data){
        console.log("helloabc");
         res.render('viewBlocks', {'user': view_details});
         //res.redirect('formP.html')

    });
    
})

//app.get('/display_list',function(req,res){

function get_patient_list(provider_name) {
    return new Promise(function(resolve,reject){  
    var db = new mongo.Db('test', new mongo.Server('localhost', 27017, {}), {});
                                          
                                          db.open(function(err, client)
                                          {
                                          //--------------------------certInfo1------------<<-----data stored 
                                                    client.createCollection("certInfo4", function(err, col) 
                                                    {
                                                            client.collection("certInfo4", function(err, col)
                                                            {
                                                                

                                                                col.find().toArray(function(err,doc)
                                                                {
                                                                    var j=0;
                                                                   
                                                                    if(!err)
                                                                     {
                                                                        console.log("doc lenth: "+doc.length);
                                                                        for (var i =0; i<doc.length ; i++) {
                                                                            if(doc[i].prname==provider_name)
                                                                            {
                                                                                patient_arr[j]=doc[i];
                                                                                j++;
                                                                            console.log("patient: "+JSON.stringify(patient_arr[i]));
                                                                            }
                                                                        };
                                                                        return resolve({body: "success"});
                                                                    
                                                                     }


                                                                });

                                                             
                                                            });
                                                    });
                                           });
                                      });

                                    
    //res.render('providerview',{'patientlist': patient_arr});
}
var server = app.listen(8081, function () {
    var host = server.address().address;
    var port = server.address().port;
    console.log("Example app listening at http://%s:%s", host, port);

})



