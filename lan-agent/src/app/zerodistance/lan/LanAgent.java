package app.zerodistance.lan;

import java.io.*;
import java.lang.instrument.*;
import java.security.ProtectionDomain;
import java.util.*;

/** Local integrated-server policy. No login tokens, network requests or on-disk game edits. */
public final class LanAgent implements ClassFileTransformer {
    private final Properties targets;
    private LanAgent(Properties targets) { this.targets = targets; }
    public static void premain(String file, Instrumentation instrumentation) throws Exception {
        Properties targets = new Properties();
        try (InputStream input = new FileInputStream(file)) { targets.load(input); }
        if (targets.isEmpty()) throw new IllegalArgumentException("Empty local LAN policy");
        instrumentation.addTransformer(new LanAgent(targets));
        System.out.println("[ZeroDistance LAN] READY: local host policy enabled");
    }
    @Override public byte[] transform(ClassLoader loader, String name, Class<?> redefining,
            ProtectionDomain domain, byte[] bytes) {
        String target = targets.getProperty(name);
        if (target == null) return null;
        try {
            String[] parts = target.split("\\|", 2);
            byte[] result = patch(bytes, parts[0], new HashSet<String>(Arrays.asList(parts[1].split(","))));
            System.out.println("[ZeroDistance LAN] APPLIED: integrated host authentication disabled; other servers unchanged");
            return result;
        } catch (Exception error) {
            System.err.println("[ZeroDistance LAN] ERROR: unsupported server method; local host policy was NOT applied: " + error);
            return null;
        }
    }
    private static final class Reader {
        final byte[] bytes; int at;
        Reader(byte[] bytes, int at) { this.bytes = bytes; this.at = at; }
        int u1() { return bytes[at++] & 255; }
        int u2() { return (u1() << 8) | u1(); }
        int u4() { return (u2() << 16) | u2(); }
        void skip(int count) { if (count < 0 || at + count > bytes.length) throw new IllegalArgumentException("Invalid class size"); at += count; }
    }
    private static void skipMember(Reader reader) {
        reader.skip(6); int attributes = reader.u2();
        for (int i = 0; i < attributes; i++) { reader.skip(2); reader.skip(reader.u4()); }
    }
    private static void utf(DataOutputStream output, String text) throws IOException { output.writeByte(1); output.writeUTF(text); }
    /** Keep the original boolean field value for every object except an IntegratedServer instance.
     * Straight-line bytecode needs no stack-map frames, and preserves field/constant-pool indices.
     */
    public static byte[] patch(byte[] bytes, String integratedClass, Set<String> methods) throws Exception {
        if (bytes.length < 20 || new DataInputStream(new ByteArrayInputStream(bytes)).readInt() != 0xcafebabe) throw new IllegalArgumentException("Not a class file");
        Reader reader = new Reader(bytes, 8); int count = reader.u2();
        String[] strings = new String[count]; int[] tags = new int[count], refs = new int[count];
        for (int i = 1; i < count; i++) {
            int tag = reader.u1(); tags[i] = tag;
            switch (tag) {
                case 1: { int n = reader.u2(); strings[i] = new DataInputStream(new ByteArrayInputStream(bytes, reader.at - 2, n + 2)).readUTF(); reader.skip(n); break; }
                case 3: case 4: reader.skip(4); break;
                case 5: case 6: reader.skip(8); i++; break;
                case 7: case 8: case 16: case 19: case 20: reader.skip(2); break;
                case 9: case 10: case 11: case 12: case 17: case 18: reader.skip(2); refs[i] = reader.u2(); break;
                case 15: reader.skip(3); break;
                default: throw new IllegalArgumentException("Unsupported constant " + tag);
            }
        }
        int poolEnd = reader.at;
        reader.skip(6); int interfaces = reader.u2(); reader.skip(interfaces * 2);
        int fields = reader.u2(); for (int i = 0; i < fields; i++) skipMember(reader);
        int methodCount = reader.u2();
        for (int i = 0; i < methodCount; i++) {
            int access = reader.u2(); String method = strings[reader.u2()], descriptor = strings[reader.u2()];
            int attributes = reader.u2();
            for (int a = 0; a < attributes; a++) {
                int attributeStart = reader.at, attributeName = reader.u2(), length = reader.u4(), body = reader.at;
                if (methods.contains(method) && "()Z".equals(descriptor) && (access & (8 | 256 | 1024)) == 0 && "Code".equals(strings[attributeName])) {
                    Reader code = new Reader(bytes, body); code.u2(); int locals = code.u2(), size = code.u4();
                    if (size == 5 && code.u1() == 0x2a && code.u1() == 0xb4) {
                        int field = code.u2();
                        if (code.u1() == 0xac && tags[field] == 9 && "Z".equals(strings[refs[refs[field]]])) {
                            if (count > 65527) throw new IllegalArgumentException("Constant pool full");
                            ByteArrayOutputStream added = new ByteArrayOutputStream(); DataOutputStream pool = new DataOutputStream(added);
                            utf(pool, integratedClass); pool.writeByte(7); pool.writeShort(count);
                            utf(pool, "java/lang/Class"); pool.writeByte(7); pool.writeShort(count + 2);
                            utf(pool, "isInstance"); utf(pool, "(Ljava/lang/Object;)Z");
                            pool.writeByte(12); pool.writeShort(count + 4); pool.writeShort(count + 5);
                            pool.writeByte(10); pool.writeShort(count + 3); pool.writeShort(count + 6);
                            ByteArrayOutputStream instructions = new ByteArrayOutputStream(); DataOutputStream out = new DataOutputStream(instructions);
                            out.writeByte(0x2a); out.writeByte(0xb4); out.writeShort(field);
                            out.writeByte(0x13); out.writeShort(count + 1); // IntegratedServer.class
                            out.writeByte(0x2a); out.writeByte(0xb6); out.writeShort(count + 7); // Class.isInstance(this)
                            out.writeByte(0x04); out.writeByte(0x82); out.writeByte(0x7e); out.writeByte(0xac); // original & !integrated
                            byte[] opcodes = instructions.toByteArray();
                            ByteArrayOutputStream result = new ByteArrayOutputStream(); DataOutputStream changed = new DataOutputStream(result);
                            changed.write(bytes, 0, 8); changed.writeShort(count + 8); changed.write(bytes, 10, poolEnd - 10); changed.write(added.toByteArray());
                            changed.write(bytes, poolEnd, attributeStart - poolEnd);
                            changed.writeShort(attributeName); changed.writeInt(12 + opcodes.length);
                            changed.writeShort(3); changed.writeShort(locals); changed.writeInt(opcodes.length); changed.write(opcodes); changed.writeShort(0); changed.writeShort(0);
                            changed.write(bytes, body + length, bytes.length - body - length);
                            return result.toByteArray();
                        }
                    }
                }
                reader.at = body; reader.skip(length);
            }
        }
        throw new IllegalArgumentException("No verified boolean authentication getter");
    }
}
