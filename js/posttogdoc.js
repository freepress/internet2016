function sendToGoogle () {
  // do validation.. if you want and then post it.


   //get values from form
   var name = $('#name').val(),
      email = $('#email').val(),
      address = $('#address').val(),
      zip = $('#zipcode').val(),
      hostParty = $('#host-party').val(),
      orgPartner = $('#org-party').val();

   //encode them for the google form
   var formData = {
     "entry.669712905" : name,
     "entry.796126805" : email,
     "entry.18269311": address,
     "entry.1870174745": zip,
     "entry.419299569": hostParty,
     "entry.468730142": orgPartner
   };

   //update the view with a loading icon
   $('#sign-up').html('<img src="img/loading.gif" />');

   //send the post to google docs
   $.ajax({
     url: "https://docs.google.com/forms/d/1wqFc_Oic5ZaHTUX9OpZdrpBKCjIyT3bBVjzSLUqnkms/formResponse",
     // dataType: "jsonp",
     type:"post",
     data: formData,
     success: function () {
       console.log('success');
     },
     error: function(xhr, statusText, error){
          console.log('error, but it posted');
        },
     complete: function () {
       $('#sign-up').html('<h1>Thanks for signing up!</h1>');
     }
   });
}

function submitFormClick () {
  event.preventDefault();
  sendToGoogle();
};
