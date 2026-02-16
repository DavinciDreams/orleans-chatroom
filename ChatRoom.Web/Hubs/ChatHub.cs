using ChatRoom;
using Microsoft.AspNetCore.SignalR;
using Orleans.Streams;

namespace ChatRoom.Web.Hubs;

public class ChatHub : Hub
{
    private readonly IClusterClient _client;
    private readonly ILogger<ChatHub> _logger;

    public ChatHub(IClusterClient client, ILogger<ChatHub> logger)
    {
        _client = client;
        _logger = logger;
    }

    public async Task JoinChannel(string channelName, string nickname)
    {
        try
        {
            var channel = _client.GetGrain<IChannelGrain>(channelName);
            var streamId = await channel.Join(nickname);

            // Store user info in connection state
            Context.Items["ChannelName"] = channelName;
            Context.Items["Nickname"] = nickname;
            Context.Items["StreamId"] = streamId;

            // Add to SignalR group for this channel
            await Groups.AddToGroupAsync(Context.ConnectionId, channelName);

            // Subscribe to Orleans stream
            var streamProvider = _client.GetStreamProvider("chat");
            var stream = streamProvider.GetStream<ChatMsg>(streamId);

            // Create subscription
            var subscription = await stream.SubscribeAsync(async (msg, _) =>
            {
                await Clients.Group(channelName).SendAsync("ReceiveMessage", new
                {
                    author = msg.Author,
                    text = msg.Text,
                    created = msg.Created
                });
            });

            // Store subscription handle
            Context.Items["Subscription"] = subscription;

            // Get chat history
            var history = await channel.ReadHistory(50);
            await Clients.Caller.SendAsync("LoadHistory", history.Select(m => new
            {
                author = m.Author,
                text = m.Text,
                created = m.Created
            }));

            // Get current members
            var members = await channel.GetMembers();
            await Clients.Group(channelName).SendAsync("UpdateMembers", members);

            _logger.LogInformation("User {Nickname} joined channel {Channel}", nickname, channelName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error joining channel");
            throw;
        }
    }

    public async Task SendMessage(string message)
    {
        try
        {
            var channelName = Context.Items["ChannelName"] as string;
            var nickname = Context.Items["Nickname"] as string;

            if (string.IsNullOrEmpty(channelName) || string.IsNullOrEmpty(nickname))
            {
                throw new InvalidOperationException("User not joined to a channel");
            }

            var channel = _client.GetGrain<IChannelGrain>(channelName);
            var msg = new ChatMsg(nickname, message);
            await channel.Message(msg);

            _logger.LogInformation("Message sent by {Nickname} in {Channel}", nickname, channelName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending message");
            throw;
        }
    }

    public async Task LeaveChannel()
    {
        try
        {
            var channelName = Context.Items["ChannelName"] as string;
            var nickname = Context.Items["Nickname"] as string;

            if (string.IsNullOrEmpty(channelName) || string.IsNullOrEmpty(nickname))
            {
                return;
            }

            // Unsubscribe from Orleans stream
            if (Context.Items["Subscription"] is StreamSubscriptionHandle<ChatMsg> subscription)
            {
                await subscription.UnsubscribeAsync();
            }

            // Leave channel in Orleans
            var channel = _client.GetGrain<IChannelGrain>(channelName);
            await channel.Leave(nickname);

            // Remove from SignalR group
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, channelName);

            // Update members list
            var members = await channel.GetMembers();
            await Clients.Group(channelName).SendAsync("UpdateMembers", members);

            _logger.LogInformation("User {Nickname} left channel {Channel}", nickname, channelName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error leaving channel");
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await LeaveChannel();
        await base.OnDisconnectedAsync(exception);
    }
}
