
$( document ).ready(function() {


    $( "#id_user_internet2016_sticker_yes" ).on( "click", function() {
      $('#form-more-info').fadeToggle();
    });

    /////////////////////////////////////-+++-
    // Scripts for the table at /voter-guide
    //

      // this reorganizes and stacks the table on mobile
      // requires stacktable plugin: https://github.com/johnpolacek/stacktable.js/
      $('#voter-guide-table').stacktable();

      // this makes the thead of the table sticky as your scroll down the page
      // requires StickyTableHeaders plugin: https://github.com/jmosbech/StickyTableHeaders
      $('#voter-guide-table').stickyTableHeaders();

      // this applies a class to the thead in order to hide large elements (like the photots) when you scroll down the page
      // requires waypoints to trigger the class, hide animation applied via CSS
      // https://github.com/imakewebthings/waypoints
      var waypoints = $('#voter-guide-table tbody').waypoint({
        handler: function(direction) {
          if (direction == "down") {
              $('#voter-guide-table').addClass('js-smallTableHeader');
          } else if (direction == "up") {
              $('#voter-guide-table').removeClass('js-smallTableHeader');            
          }
        }
      });

});