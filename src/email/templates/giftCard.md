Hi there! {{ reason }}


{{# if featuredProduct}}
In recognition, we'd like to send you a [{{ featuredProduct }}]({{link}}). (Or you can get any other products in our store up to ${{ amount }} USD.)
{{else}}
In recognition, we're sending you a ${{ amount }} giftcard for [the CodeDay Store]({{link}}).
{{/if}}

Use this code at checkout to receive the ${{amount}} credit with free shipping: <strong>{{code}}</strong>

This code expires in a month, so [click here to use it now.]({{ link }})

{{{ event.emailSignature }}}