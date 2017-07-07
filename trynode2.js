process.env.GOPATH = __dirname;

var hfc = require('hfc');
var util = require('util');
var fs = require('fs');
var path =require('path');
const https = require('https');
var http=require('http');
var express =require('express');
var app= express();
var bodyParser=require('body-parser');
//var MongoClient = require('mongodb').MongoClient; //for userid : certificate
var mongo = require('mongodb');

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

var host = process.env.VCAP_APP_HOST || 'localhost';
var port = process.env.VCAP_APP_PORT || 3000;

console.log('Staring http server on: ' + host + ':' + port);

var server = http.createServer(app).listen(port, function () {

    console.log('Server Up - ' + host + ':' + port);
    //onsole.log("hiiii");
 
});

//console.log("hiiii");
var config;
var chain;
var network;
var certPath;
var peers;
var users;
var userObj;
var newUserName;
var chaincodeID;
var certFile = 'us.blockchain.ibm.com.cert';
var chaincodeIDPath = __dirname + "/chaincodeID";

//console.log("hiiii");
var caUrl;
var peerUrls = [];
var EventUrls = [];

init();

function init() {
	
    try {
        config = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));
    } catch (err) {
        console.log("config.json is missing or invalid file, Rerun the program with right file")
        process.exit();
    }

    // Create a client blockchin.
    chain = hfc.newChain(config.chainName);
    //path to copy the certificate
    certPath = __dirname + "/src/" + config.deployRequest.chaincodePath + "/certificate.pem";

    // Read and process the credentials.json
    try {
        network = JSON.parse(fs.readFileSync(__dirname + '/ServiceCredentials.json', 'utf8'));
        if (network.credentials) network = network.credentials;
    } catch (err) {
        console.log("ServiceCredentials.json is missing or invalid file, Rerun the program with right file")
        process.exit();
    }

    peers = network.peers;
    users = network.users;

    setup();

    printNetworkDetails();
    //Check if chaincode is already deployed
    //TODO: Deploy failures aswell returns chaincodeID, How to address such issue?
    if (fileExists(chaincodeIDPath)) {
        console.log("There is chaincodeID");
        // Read chaincodeID and use this for sub sequent Invokes/Queries
        chaincodeID = fs.readFileSync(chaincodeIDPath, 'utf8');
        chain.getUser(newUserName, function(err, user) {
            if (err) throw Error(" Failed to register and enroll " + deployerName + ": " + err);
            userObj = user;
           //invoke();
         //invoke_my();
        });
    } else {
        enrollAndRegisterUsers();
    }
}

function setup() {
    // Determining if we are running on a startup or HSBN network based on the url
    // of the discovery host name.  The HSBN will contain the string zone.
    var isHSBN = peers[0].discovery_host.indexOf('secure') >= 0 ? true : false;
    var network_id = Object.keys(network.ca);
    caUrl = "grpcs://" + network.ca[network_id].discovery_host + ":" + network.ca[network_id].discovery_port;

    // Configure the KeyValStore which is used to store sensitive keys.
    // This data needs to be located or accessible any time the users enrollmentID
    // perform any functions on the blockchain.  The users are not usable without
    // This data.
    var uuid = network_id[0].substring(0, 8);
    chain.setKeyValStore(hfc.newFileKeyValStore(__dirname + '/keyValStore-' + uuid));

    if (isHSBN) {
        certFile = '0.secure.blockchain.ibm.com.cert';
    }
    fs.createReadStream(certFile).pipe(fs.createWriteStream(certPath));
    var cert = fs.readFileSync(certFile);

    chain.setMemberServicesUrl(caUrl, {
        pem: cert
    });

    peerUrls = [];
    eventUrls = [];
    // Adding all the peers to blockchain
    // this adds high availability for the client
    for (var i = 0; i < peers.length; i++) {
        // Peers on Bluemix require secured connections, hence 'grpcs://'
        peerUrls.push("grpcs://" + peers[i].discovery_host + ":" + peers[i].discovery_port);
        chain.addPeer(peerUrls[i], {
            pem: cert
        });
        eventUrls.push("grpcs://" + peers[i].event_host + ":" + peers[i].event_port);
        chain.eventHubConnect(eventUrls[0], {
            pem: cert
        });
    }
    newUserName = config.user.username;
    // Make sure disconnect the eventhub on exit
    process.on('exit', function() {
        chain.eventHubDisconnect();
    });
}

function printNetworkDetails() {
    console.log("\n------------- ca-server, peers and event URL:PORT information: -------------");
    console.log("\nCA server Url : %s\n", caUrl);
    for (var i = 0; i < peerUrls.length; i++) {
        console.log("Validating Peer%d : %s", i, peerUrls[i]);
    }
    console.log("");
    for (var i = 0; i < eventUrls.length; i++) {
        console.log("Event Url on Peer%d : %s", i, eventUrls[i]);
    }
    console.log("");
    console.log('-----------------------------------------------------------\n');
}

function enrollAndRegisterUsers() {

    // Enroll a 'admin' who is already registered because it is
    // listed in fabric/membersrvc/membersrvc.yaml with it's one time password.
    console.log(users[0].enrollId, users[0].enrollSecret);
    chain.enroll(users[0].enrollId, users[0].enrollSecret, function(err, admin) {
        if (err) throw Error("\nERROR: failed to enroll admin : " + err);

        console.log("\nEnrolled admin sucecssfully");

        // Set this user as the chain's registrar which is authorized to register other users.
        chain.setRegistrar(admin);

        //creating a new user
        var registrationRequest = {
            enrollmentID: newUserName,
            affiliation: config.user.affiliation
        };
        console("enrollAndRegisterUsers() --:newUserName"+newUserName);
        chain.registerAndEnroll(registrationRequest, function(err, user) {
            if (err) throw Error(" Failed to register and enroll " + newUserName + ": " + err);

            console.log("\nEnrolled and registered " + newUserName + " successfully");
            userObj = user;
            //setting timers for fabric waits
            chain.setDeployWaitTime(config.deployWaitTime);
            console.log("\nDeploying chaincode ...");
            deployChaincode();
        });
    });
}

function deployChaincode() {
    var args = getArgs(config.deployRequest);
    // Construct the deploy request
    var deployRequest = {
        // Function to trigger
        fcn: config.deployRequest.functionName,
        // Arguments to the initializing function
        args: args,
        //chaincodePath: config.deployRequest.chaincodePath,
        chaincodePath:config.deployRequest.chaincodePath,
        // the location where the startup and HSBN store the certificates
        certificatePath: network.cert_path
    };

    // Trigger the deploy transaction
    var deployTx = userObj.deploy(deployRequest);

    // Print the deploy results
    deployTx.on('complete', function(results) {
        // Deploy request completed successfully
        chaincodeID = results.chaincodeID;
        console.log("\nChaincode ID : " + chaincodeID);
        console.log(util.format("\nSuccessfully deployed chaincode: request=%j, response=%j", deployRequest, results));
        // Save the chaincodeID
        fs.writeFileSync(chaincodeIDPath, chaincodeID);
        invoke();
    });

    deployTx.on('error', function(err) {
        // Deploy request failed
        console.log(util.format("\nFailed to deploy chaincode: request=%j, error=%j", deployRequest, err));
        process.exit(1);
    });
}

function invoke() {
    var args = getArgs(config.invokeRequest);
    var eh = chain.getEventHub();
    // Construct the invoke request
    var invokeRequest = {
        // Name (hash) required for invoke
        chaincodeID: chaincodeID,
        // Function to trigger
        fcn: config.invokeRequest.functionName,
        // Parameters for the invoke function
        args: args
    };

    // Trigger the invoke transaction
    var invokeTx = userObj.invoke(invokeRequest);

    // Print the invoke results
    invokeTx.on('submitted', function(results) {
        // Invoke transaction submitted successfully
        console.log(util.format("\nSuccessfully submitted chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
    });
    invokeTx.on('complete', function(results) {
        // Invoke transaction completed successfully
        console.log(util.format("\nSuccessfully completed chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
        query();
    });
    invokeTx.on('error', function(err) {
        // Invoke transaction submission failed
        console.log(util.format("\nFailed to submit chaincode invoke transaction: request=%j, error=%j", invokeRequest, err));
        process.exit(1);
    });

    //Listen to custom events
    var regid = eh.registerChaincodeEvent(chaincodeID, "evtsender", function(event) {
        console.log(util.format("Custom event received, payload: %j\n", event.payload.toString()));
        eh.unregisterChaincodeEvent(regid);
    });
}

function query() {
    var args = getArgs(config.queryRequest);
    // Construct the query request
    var queryRequest = {
        // Name (hash) required for query
        chaincodeID: chaincodeID,
        // Function to trigger
        fcn: config.queryRequest.functionName,
        // Existing state variable to retrieve
        args: args
    };

    // Trigger the query transaction
    var queryTx = userObj.query(queryRequest);

    // Print the query results
    queryTx.on('complete', function(results) {
        // Query completed successfully
        console.log("\nSuccessfully queried  chaincode function: request=%j, value=%s", queryRequest, results.result.toString());
        process.exit(0);
    });
    queryTx.on('error', function(err) {
        // Query failed
        console.log("\nFailed to query chaincode, function: request=%j, error=%j", queryRequest, err);
        process.exit(1);
    });
}
function getArgs(request) {
    var args = [];
    for (var i = 0; i < request.args.length; i++) {
        args.push(request.args[i]);
    }
    return args;
}

function fileExists(filePath) {
    try {
        return fs.statSync(filePath).isFile();
    } catch (err) {
        return false;
    }
}


function invoke_my(arg) {
    //var args = getArgs(config.invokeRequest);
    return new Promise(function(resolve,reject){

    
    var u;
    chain.getUser("JohnDoe",function(err,user){
        u=user
    })
    var eh = chain.getEventHub();
    // Construct the invoke request
    var invokeRequest = {
        // Name (hash) required for invoke
        chaincodeID: chaincodeID,
        // Function to trigger
        fcn: "write",
        // Parameters for the invoke function
        args: arg
    };
    chain.setInvokeWaitTime(100);
    // Trigger the invoke transaction
    var invokeTx = u.invoke(invokeRequest);
    
    // Print the invoke results
    invokeTx.on('submitted', function(results) {
        // Invoke transaction submitted successfully
        console.log(util.format("\nSuccessfully submitted chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
    });
    invokeTx.on('complete', function(results) {
        // Invoke transaction completed successfully
        console.log(util.format("\nSuccessfully completed chaincode invoke transaction: request=%j, response=%j", invokeRequest, results));
        //query();
        return resolve({body:"true"});
    });
    invokeTx.on('error', function(err) {
        // Invoke transaction submission failed
        console.log(util.format("\nFailed to submit chaincode invoke transaction: request=%j, error=%j", invokeRequest, err));
        return resolve({body:"false"});
    });

    //Listen to custom events
    var regid = eh.registerChaincodeEvent(chaincodeID, "evtsender", function(event) {
        console.log(util.format("Custom event received, payload: %j\n", event.payload.toString()));
        eh.unregisterChaincodeEvent(regid);
    });
})
}

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
        		chain.registerAndEnroll(registrationRequest, function(err, user) {
            console.log("err : "+err);
            if (err) return resolve({body:"Can not enroll this user"});
            var certificate=user.enrollment.cert;
            console.log("\nEnrolled and registered " +certificate + " successfully");
            //console.log("\nEnrolled and registered " +user.name + " successfully");
            //setting timers for fabric waits
            //Node.js and MongoDb connection starts here !
            // Retrieve
            // Connect to the db

            var r = "name";
            var cert = "cert";
            var query = {};
            query[r]=user.name
            query[cert] = certificate;
            console.log(query);

            var db = new mongo.Db('test', new mongo.Server('localhost', 27017, {}), {});
            db.open(function(err, client){
                client.createCollection("certInfo", function(err, col) {
                    client.collection("certInfo", function(err, col) {
                    col.insert(query, function(){});
                });
            });
            });
            return resolve({body:"registred"});
        });
    }
    else{
        return resolve({body:"admin is not registred"})
    }
    });
})
}



app.get('/',function(req,res){
   
    res.sendFile(__dirname+'/public/tryindex.html');
    
})

app.get('/checkUser',function(req,res)//login
{
    var flag=0;
    console.log("username - "+req.query.username);
	var username=req.query.username;
    chain.getUser(req.query.username,function(err,user)
    {
	
            var network_id = Object.keys(network.ca);
            var uuid = network_id[0].substring(0, 8);
            var path=__dirname + '/keyValStore-' + uuid;
            fs.readdir(path, function(err, items) 
            {
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
                        //console.log("login successful");
                        res.redirect('redirect.html');

                  }
                  else
                  {
                         console.log("login not successful");

                  }
             })

           
    })
});

	

    //})
//})


app.get('/userReg',function(req,res){//registration

    var username=req.query.username;
    var role=req.query.role;

    var flag=0;

    var username=req.query.username;
    chain.getUser(req.query.username,function(err,user)
    {
    
         var network_id = Object.keys(network.ca);
            var uuid = network_id[0].substring(0, 8);
            var path=__dirname + '/keyValStore-' + uuid;
            fs.readdir(path, function(err, items) 
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
                        enrollAndRegisterNewUsers(username,role).then(function(response){
                        res.json(response.body);
                        })
                  }
                  
             })          
    })

    

})





