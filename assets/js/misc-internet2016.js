
$( document ).ready(function() {


    $( "#id_user_internet2016_sticker_yes" ).on( "click", function() {
      $('#form-more-info').fadeToggle();
    });

    $('#voter-guide-table').stacktable();
    $('#voter-guide-table').stickyTableHeaders();

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
