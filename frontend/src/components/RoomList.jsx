export default function RoomList({ rooms, currentRoom, unreadCounts, onJoinRoom }) {
  const publicRooms = rooms.filter(r => !r.isDirect);
  const directMessages = rooms.filter(r => r.isDirect);

  const renderRoom = (r) => (
    <li 
      key={r.id} 
      style={{ 
        padding: '0.5rem 1rem', 
        cursor: 'pointer', 
        borderRadius: '4px',
        backgroundColor: currentRoom === r.id ? 'rgba(255,255,255,0.1)' : 'transparent',
        marginBottom: '4px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
      onClick={() => onJoinRoom(r.id)}
    >
      <span>{r.isDirect ? r.name : `# ${r.name}`}</span>
      {unreadCounts && unreadCounts[r.id] > 0 && (
        <span style={{ 
          background: '#00d2ff', 
          color: '#000', 
          borderRadius: '12px', 
          padding: '2px 8px', 
          fontSize: '0.75rem',
          fontWeight: 'bold'
        }}>
          {unreadCounts[r.id]}
        </span>
      )}
    </li>
  );

  return (
    <div className="room-list" style={{ padding: '1rem', borderRight: '1px solid rgba(255,255,255,0.1)', minWidth: '200px' }}>
      <h2>Rooms</h2>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: '1rem' }}>
        {publicRooms.map(renderRoom)}
      </ul>
      
      {directMessages.length > 0 && (
        <>
          <h2 style={{ marginTop: '2rem' }}>Direct Messages</h2>
          <ul style={{ listStyle: 'none', padding: 0, marginTop: '1rem' }}>
            {directMessages.map(renderRoom)}
          </ul>
        </>
      )}
    </div>
  );
}
