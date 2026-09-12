const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});
    const is_wasm = target.result.cpu.arch == .wasm32;

    if (is_wasm) {
        const wasm_module = b.createModule(.{
            .root_source_file = b.path("src/wasm_entry.zig"),
            .target = target,
            .optimize = optimize,
        });

        const wasm_exe = b.addExecutable(.{
            .name = "remap",
            .root_module = wasm_module,
        });
        wasm_exe.entry = .disabled;
        wasm_exe.rdynamic = true;

        const install = b.addInstallArtifact(wasm_exe, .{});
        b.getInstallStep().dependOn(&install.step);
        return;
    }

    const timesampler_module = b.createModule(.{
        .root_source_file = b.path("src/root.zig"),
        .target = target,
        .optimize = optimize,
    });

    const lib = b.addLibrary(.{
        .name = "timesampler",
        .root_module = timesampler_module,
    });
    b.installArtifact(lib);

    const tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/fixture_tests.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "timesampler", .module = timesampler_module },
            },
        }),
    });

    const run_tests = b.addRunArtifact(tests);
    const test_step = b.step("test", "Run fixture oracle tests");
    test_step.dependOn(&run_tests.step);
}
